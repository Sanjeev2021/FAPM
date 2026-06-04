"""
FLAIX PPT Generator — FastAPI microservice

Receives campaign JSON, fills a PPTX template with python-pptx, returns .pptx bytes.

Template structure (client template, 13 slides, 0-indexed):
  0-6  : Corporate slides — kept as-is
  7    : Campaign name slide ("NOM DE CAMPAGNE")
  8    : Recap slide ("Récapitulatif campagne")
  9    : PRINT support template — cloned per Print support
  10   : WEB support template  — cloned per Web/NL support
  11   : "Nos engagements"     — kept as-is
  12   : "A bientôt"           — kept as-is
"""

import io
import copy
from typing import Optional

import httpx
from fastapi import FastAPI, HTTPException
from fastapi.responses import StreamingResponse
from pydantic import BaseModel
from pptx import Presentation
from pptx.util import Pt
from pptx.dml.color import RGBColor
from lxml import etree

app = FastAPI(title="FLAIX PPT Generator", version="2.0.0")


# ─── Constants ────────────────────────────────────────────────────────────────

YELLOW    = RGBColor(0xFE, 0xFF, 0x00)   # #FEFF00 — matches client template
WHITE     = RGBColor(0xFF, 0xFF, 0xFF)
DARK_NAVY = RGBColor(0x0F, 0x2D, 0x55)  # PLS dark navy — for light backgrounds
DARK_GRAY = RGBColor(0x44, 0x44, 0x44)  # readable label gray — for light backgrounds
FONT_NAME = "Montserrat"

CAMPAIGN_SLIDE_IDX  = 7
RECAP_SLIDE_IDX     = 8
PRINT_TEMPLATE_IDX  = 9
WEB_TEMPLATE_IDX    = 10
NL_TEMPLATE_IDX     = 11
ENGAGEMENTS_IDX     = 12
CLOSING_IDX         = 13

NSMAP = "http://schemas.openxmlformats.org/drawingml/2006/main"


# ─── Request schemas (backward-compatible superset) ───────────────────────────

class SupportPayload(BaseModel):
    name: str
    canal: str = "Print"                    # "Print" | "Web" | "NL"
    # Per-canal fields (new)
    periodicite: Optional[str] = None
    diffusion_print: Optional[int] = None
    format_print: Optional[str] = None
    visites_par_mois: Optional[int] = None
    pages_vues_par_mois: Optional[int] = None
    nombre_envois_nl: Optional[int] = None
    lectorat: Optional[str] = None
    categorie: Optional[str] = None
    # New pricing + date fields
    quantite: Optional[int] = None
    tarif_brut_computed: Optional[float] = None
    tarif_net_computed: Optional[float] = None
    date_parution: Optional[str] = None
    date_bouclage: Optional[str] = None
    periodicite_nl: Optional[str] = None
    abonnes_nl: Optional[int] = None
    taux_ouverture: Optional[float] = None
    url: Optional[str] = None
    format_web: Optional[str] = None
    format_nl: Optional[str] = None
    # Old fields — accepted but not used with new template
    visual_url: Optional[str] = None
    diffusion: Optional[str] = None
    format: Optional[str] = None
    period: Optional[str] = None
    budget: Optional[str] = None
    argument: Optional[str] = None


class MetadataPayload(BaseModel):
    # New fields
    campagne: Optional[str] = None
    agence: Optional[str] = None
    annonceur: Optional[str] = None
    budget: Optional[str] = None
    cible: Optional[str] = None
    objectif: Optional[str] = None
    periode: Optional[str] = None
    canaux: Optional[str] = None
    secteurs_exclus: Optional[str] = None
    contact_nom: Optional[str] = None
    contact_email: Optional[str] = None
    # Old fields — mapped at runtime
    name: Optional[str] = None
    agency: Optional[str] = None
    advertiser: Optional[str] = None
    context: Optional[str] = None


class GenerateRequest(BaseModel):
    template_url: str
    metadata: Optional[MetadataPayload] = None   # new
    campaign: Optional[MetadataPayload] = None   # old — mapped to metadata
    supports: list[SupportPayload]


# ─── Helpers ──────────────────────────────────────────────────────────────────

async def download_file(url: str) -> bytes:
    async with httpx.AsyncClient(timeout=httpx.Timeout(120.0, connect=15.0)) as client:
        resp = await client.get(url)
        resp.raise_for_status()
        return resp.content


def fr_number(n: int) -> str:
    """Format integer with French thousands separator (narrow no-break space)."""
    return f"{n:,}".replace(",", "\u202f")


def fr_euros(n: float) -> str:
    """Format euro amount with French thousands separator."""
    return f"{n:,.0f}".replace(",", "\u202f") + "\u00a0€"


def find_shape_by_name(slide, name: str):
    for shape in slide.shapes:
        if shape.name == name:
            return shape
    return None


def clear_text_frame(tf):
    """Safely clear a text frame — keeps exactly one empty paragraph."""
    for p in list(tf.paragraphs[1:]):
        p._p.getparent().remove(p._p)
    tf.paragraphs[0].clear()


def add_label_value(tf, label: str, value: str, font_size=Pt(20), is_first=False):
    """Add 'Label : Value' paragraph — label in white normal, value in yellow bold."""
    p = tf.paragraphs[0] if is_first else tf.add_paragraph()

    r_label = p.add_run()
    r_label.text = f"{label}\u00a0: "   # non-breaking space before colon
    r_label.font.name = FONT_NAME
    r_label.font.size = font_size
    r_label.font.color.rgb = WHITE
    r_label.font.bold = False

    r_val = p.add_run()
    r_val.text = value
    r_val.font.name = FONT_NAME
    r_val.font.size = font_size
    r_val.font.color.rgb = YELLOW
    r_val.font.bold = True


# ─── Slide duplication with relationship copying ──────────────────────────────

def duplicate_slide_with_rels(prs: Presentation, slide_index: int):
    """
    Duplicate a slide, correctly copying all part relationships (images, etc.)
    so backgrounds and logos render correctly on the clone.
    """
    template_slide = prs.slides[slide_index]
    new_slide = prs.slides.add_slide(template_slide.slide_layout)

    # Remove default placeholders added by add_slide
    for ph in list(new_slide.placeholders):
        ph._element.getparent().remove(ph._element)

    # Copy relationships and build old_rId → new_rId mapping.
    # Use part.relate_to() — the stable python-pptx public API — instead of the
    # internal get_or_add / get_or_add_ext_rel methods which changed between versions
    # and silently failed for image rels, causing missing images on cloned slides.
    rid_map: dict[str, str] = {}
    for rel in template_slide.part.rels.values():
        try:
            if rel.is_external:
                new_rid = new_slide.part.relate_to(rel.target_ref, rel.reltype, is_external=True)
            else:
                new_rid = new_slide.part.relate_to(rel.target_part, rel.reltype)
            rid_map[rel.rId] = new_rid
        except Exception as exc:
            # Layout rels and a few other types are expected to fail — log, don't swallow
            print(f"  [duplicate_slide] rel copy skipped rId={rel.rId} type={rel.reltype}: {exc}")

    # Deep-copy shape XML and rewrite rId references
    R_NS = "http://schemas.openxmlformats.org/officeDocument/2006/relationships"
    for shape in template_slide.shapes:
        el = copy.deepcopy(shape._element)
        # Rewrite r:embed, r:id, r:link attributes
        for node in el.iter():
            for attr_name in list(node.attrib):
                if attr_name.startswith(f"{{{R_NS}}}"):
                    old_rid = node.attrib[attr_name]
                    if old_rid in rid_map:
                        node.attrib[attr_name] = rid_map[old_rid]
        new_slide.shapes._spTree.append(el)

    # Copy slide-level background if present (e.g. solid fill or blip fill on <p:bg>)
    P_NS = "http://schemas.openxmlformats.org/presentationml/2006/main"
    bg = template_slide._element.find(f"{{{P_NS}}}bg")
    if bg is not None:
        new_bg = copy.deepcopy(bg)
        new_slide._element.insert(0, new_bg)

    return new_slide


# ─── Slide content fillers ─────────────────────────────────────────────────────

def _fill_support_name(slide, name: str):
    shape = find_shape_by_name(slide, "FLAIX_SUPPORT_NAME")
    if shape and shape.has_text_frame:
        clear_text_frame(shape.text_frame)
        p = shape.text_frame.paragraphs[0]
        r = p.add_run()
        r.text = name
        r.font.name = FONT_NAME
        r.font.size = Pt(18)
        r.font.color.rgb = WHITE
        r.font.bold = True


def _append_lectorat_to_metadata(tf, support: SupportPayload):
    """Append lectorat as the last line inside FLAIX_METADATA.
    Keeping it inline avoids the FLAIX_LECTORAT shape's hardcoded Y-position
    which placed readership below the image area on non-Print slides."""
    lect_value = support.lectorat or support.categorie or support.argument or ""
    if lect_value:
        add_label_value(tf, "Lectorat", lect_value, font_size=Pt(14))


def _clear_lectorat_shape(slide):
    """Clear the FLAIX_LECTORAT shape so no stale template text shows."""
    shape = find_shape_by_name(slide, "FLAIX_LECTORAT")
    if shape and shape.has_text_frame:
        clear_text_frame(shape.text_frame)


def fill_campaign_name(slide, campaign_name: str):
    """Replace the campaign name text on slide 8 (index 7)."""
    shape = find_shape_by_name(slide, "FLAIX_CAMPAIGN_NAME")
    if shape is None or not shape.has_text_frame:
        print("WARNING: FLAIX_CAMPAIGN_NAME shape not found on campaign slide")
        return
    # Replace text of first run, preserving its formatting
    tf = shape.text_frame
    for para in tf.paragraphs:
        for run in para.runs:
            if run.text.strip():
                run.text = campaign_name
                return
    # Fallback: just set the paragraph text
    if tf.paragraphs:
        tf.paragraphs[0].text = campaign_name


def fill_recap_slide(slide, meta: MetadataPayload):
    """Fill the recap slide using template shapes FLAIX_RECAP_TITLE and FLAIX_RECAP_FIELDS."""
    RECAP_FIELDS = [
        ("Annonceur",       meta.annonceur or meta.advertiser),
        ("Agence",          meta.agence    or meta.agency),
        ("Campagne",        meta.campagne  or meta.name),
        ("Budget",          meta.budget),
        ("Cible",           meta.cible),
        ("Objectif",        meta.objectif  or meta.context),
        ("Période",         meta.periode),
        ("Canaux",          meta.canaux),
        ("Secteurs exclus", meta.secteurs_exclus),
        ("Contact",         meta.contact_nom),
        ("Email",           meta.contact_email),
    ]
    rows = [(l, v) for l, v in RECAP_FIELDS if v and str(v).strip()]

    # Fill title shape
    title_shape = find_shape_by_name(slide, "FLAIX_RECAP_TITLE")
    if title_shape and title_shape.has_text_frame:
        for para in title_shape.text_frame.paragraphs:
            for run in para.runs:
                run.text = "Récapitulatif de campagne"
                break

    if not rows:
        return

    # Fill fields shape — dark colors (white background slide)
    fields_shape = find_shape_by_name(slide, "FLAIX_RECAP_FIELDS")
    if not fields_shape or not fields_shape.has_text_frame:
        return
    tf = fields_shape.text_frame
    tf.word_wrap = True
    clear_text_frame(tf)
    for i, (label, value) in enumerate(rows):
        p = tf.paragraphs[0] if i == 0 else tf.add_paragraph()
        rl = p.add_run()
        rl.text = f"{label}\u00a0: "
        rl.font.name = FONT_NAME
        rl.font.size = Pt(18)
        rl.font.color.rgb = DARK_GRAY
        rl.font.bold = False
        rv = p.add_run()
        rv.text = str(value)
        rv.font.name = FONT_NAME
        rv.font.size = Pt(18)
        rv.font.color.rgb = DARK_NAVY
        rv.font.bold = True


def fill_print_support(slide, support: SupportPayload):
    """Fill a cloned PRINT template slide."""
    _fill_support_name(slide, support.name)

    meta_shape = find_shape_by_name(slide, "FLAIX_METADATA")
    if meta_shape and meta_shape.has_text_frame:
        tf = meta_shape.text_frame
        clear_text_frame(tf)
        fs = Pt(16)
        add_label_value(tf, "Canal", "PRINT", font_size=fs, is_first=True)
        if support.periodicite:
            add_label_value(tf, "Périodicité", support.periodicite, font_size=fs)
        if support.diffusion_print is not None:
            add_label_value(tf, "Diffusion", fr_number(support.diffusion_print), font_size=fs)
        elif support.diffusion:
            add_label_value(tf, "Diffusion", support.diffusion, font_size=fs)
        if support.quantite is not None and support.quantite > 1:
            add_label_value(tf, "Insertions", str(support.quantite), font_size=fs)
        if support.tarif_brut_computed is not None:
            add_label_value(tf, "Tarif brut", fr_euros(support.tarif_brut_computed), font_size=fs)
        if support.tarif_net_computed is not None:
            add_label_value(tf, "Net PLS", fr_euros(support.tarif_net_computed), font_size=fs)
        if support.date_bouclage:
            add_label_value(tf, "Bouclage", support.date_bouclage, font_size=fs)
        if support.date_parution:
            add_label_value(tf, "Parution", support.date_parution, font_size=fs)
        if support.format_print:
            add_label_value(tf, "Format", support.format_print, font_size=fs)
        _append_lectorat_to_metadata(tf, support)

    _clear_lectorat_shape(slide)


def fill_web_support(slide, support: SupportPayload):
    """Fill a cloned WEB template slide."""
    _fill_support_name(slide, support.name)

    meta_shape = find_shape_by_name(slide, "FLAIX_METADATA")
    if meta_shape and meta_shape.has_text_frame:
        tf = meta_shape.text_frame
        clear_text_frame(tf)
        fs = Pt(16)
        add_label_value(tf, "Canal", "WEB", font_size=fs, is_first=True)
        if support.visites_par_mois is not None:
            add_label_value(tf, "Visites/mois", fr_number(support.visites_par_mois), font_size=fs)
        if support.pages_vues_par_mois is not None:
            add_label_value(tf, "Pages vues/site", fr_number(support.pages_vues_par_mois), font_size=fs)
        if support.url:
            add_label_value(tf, "URL", support.url, font_size=fs)
        if support.format_web:
            add_label_value(tf, "Format", support.format_web, font_size=fs)
        if support.tarif_brut_computed is not None:
            add_label_value(tf, "Tarif brut", fr_euros(support.tarif_brut_computed), font_size=fs)
        if support.tarif_net_computed is not None:
            add_label_value(tf, "Net PLS", fr_euros(support.tarif_net_computed), font_size=fs)
        if support.date_parution:
            add_label_value(tf, "Parution", support.date_parution, font_size=fs)
        _append_lectorat_to_metadata(tf, support)

    _clear_lectorat_shape(slide)


def fill_nl_support(slide, support: SupportPayload):
    """Fill a cloned NL template slide."""
    _fill_support_name(slide, support.name)

    meta_shape = find_shape_by_name(slide, "FLAIX_METADATA")
    if meta_shape and meta_shape.has_text_frame:
        tf = meta_shape.text_frame
        clear_text_frame(tf)
        fs = Pt(16)
        add_label_value(tf, "Canal", "NEWSLETTER", font_size=fs, is_first=True)
        if support.nombre_envois_nl is not None:
            add_label_value(tf, "Nombre d'envois", fr_number(support.nombre_envois_nl), font_size=fs)
        if support.periodicite_nl:
            add_label_value(tf, "Fréquence", support.periodicite_nl, font_size=fs)
        elif support.periodicite:
            add_label_value(tf, "Fréquence", support.periodicite, font_size=fs)
        if support.abonnes_nl is not None:
            add_label_value(tf, "Abonnés", fr_number(support.abonnes_nl), font_size=fs)
        if support.taux_ouverture is not None:
            add_label_value(tf, "Taux d'ouverture", f"{support.taux_ouverture:.0f}%", font_size=fs)
        if support.format_nl:
            add_label_value(tf, "Format", support.format_nl, font_size=fs)
        if support.tarif_brut_computed is not None:
            add_label_value(tf, "Tarif brut", fr_euros(support.tarif_brut_computed), font_size=fs)
        if support.tarif_net_computed is not None:
            add_label_value(tf, "Net PLS", fr_euros(support.tarif_net_computed), font_size=fs)
        if support.date_parution:
            add_label_value(tf, "Parution", support.date_parution, font_size=fs)
        _append_lectorat_to_metadata(tf, support)

    _clear_lectorat_shape(slide)


# ─── Slide reordering ─────────────────────────────────────────────────────────

def reorder_and_cleanup(prs: Presentation, num_print: int, num_web: int, num_nl: int):
    """
    Template has 14 slides (indices 0-13):
      0-6: corp, 7: campaign, 8: recap,
      9: PRINT_TPL, 10: WEB_TPL, 11: NL_TPL,
      12: engagements, 13: closing
    python-pptx appended all clones at the end.

    Target: corp(7) + campaign + recap + clones(N) + engagements + closing
    """
    sldIdLst = prs.slides._sldIdLst
    ids = list(sldIdLst)

    num_clones = num_print + num_web + num_nl
    expected = 14 + num_clones
    if len(ids) != expected:
        print(f"WARNING: expected {expected} slides, got {len(ids)}")

    fixed_front = ids[:9]       # corp(7) + campaign(1) + recap(1)
    # ids[9]  = PRINT_TPL → remove
    # ids[10] = WEB_TPL   → remove
    # ids[11] = NL_TPL    → remove
    engagements = ids[12]
    closing     = ids[13]
    clones      = ids[14:]

    new_order = fixed_front + clones + [engagements, closing]

    for sid in list(sldIdLst):
        sldIdLst.remove(sid)
    for sid in new_order:
        sldIdLst.append(sid)


# ─── Main endpoint ────────────────────────────────────────────────────────────

@app.post("/generate")
async def generate_ppt(request: GenerateRequest):
    """Generate a PPTX from the client template + campaign/support data."""
    try:
        # Normalize old/new schema
        meta = request.metadata or request.campaign or MetadataPayload()

        # 1. Download template
        template_bytes = await download_file(request.template_url)
        prs = Presentation(io.BytesIO(template_bytes))

        if len(prs.slides) < 14:
            raise HTTPException(
                status_code=422,
                detail=f"Template has {len(prs.slides)} slides, expected 14."
            )

        # 2. Fill campaign name slide (index 7)
        campaign_name = (
            meta.campagne
            or meta.name
            or meta.annonceur
            or meta.advertiser
            or "Campagne"
        )
        fill_campaign_name(prs.slides[CAMPAIGN_SLIDE_IDX], campaign_name)

        # 3. Fill recap slide (index 8)
        fill_recap_slide(prs.slides[RECAP_SLIDE_IDX], meta)

        # 4. Separate supports by canal
        print_supports = [s for s in request.supports if s.canal == "Print"]
        web_supports   = [s for s in request.supports if s.canal == "Web"]
        nl_supports    = [s for s in request.supports if s.canal == "NL"]

        # 5. Clone PRINT template for each Print support
        for support in print_supports:
            cloned = duplicate_slide_with_rels(prs, PRINT_TEMPLATE_IDX)
            fill_print_support(cloned, support)

        # 6. Clone WEB template for each Web support
        for support in web_supports:
            cloned = duplicate_slide_with_rels(prs, WEB_TEMPLATE_IDX)
            fill_web_support(cloned, support)

        # 7. Clone NL template for each NL support
        for support in nl_supports:
            cloned = duplicate_slide_with_rels(prs, NL_TEMPLATE_IDX)
            fill_nl_support(cloned, support)

        # 8. Reorder slides and remove original template slides
        reorder_and_cleanup(prs, len(print_supports), len(web_supports), len(nl_supports))

        # 9. Serialize and return
        output = io.BytesIO()
        prs.save(output)
        output.seek(0)

        return StreamingResponse(
            output,
            media_type="application/vnd.openxmlformats-officedocument.presentationml.presentation",
            headers={"Content-Disposition": "attachment; filename=presentation.pptx"},
        )

    except HTTPException:
        raise
    except Exception as e:
        import traceback
        traceback.print_exc()
        raise HTTPException(status_code=500, detail=str(e))


@app.get("/health")
async def health():
    return {"status": "ok", "service": "ppt-generator", "version": "2.0.0"}
