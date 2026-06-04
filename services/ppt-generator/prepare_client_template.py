"""
Prepare the client's raw PPTX template for use by the PPT generator service.

What this does:
  1. Removes 3 example content images from dynamic slides (9, 10, 11)
  2. Renames key shapes to stable FLAIX_* names
  3. Replaces example text with readable {{placeholder}} tokens
  4. Adds an NL template slide (duplicate of WEB with newsletter-specific labels)

What this does NOT touch:
  - All logos, branding, footer shapes
  - Corporate slides (1-7)
  - "Nos engagements" and "A bientôt" closing slides

Output template slide structure (14 slides):
  0-6  : Corporate (unchanged)
  7    : Campaign name   → FLAIX_CAMPAIGN_NAME
  8    : Recap           → empty (text box added at generation time)
  9    : PRINT template  → FLAIX_SUPPORT_NAME / FLAIX_METADATA / FLAIX_LECTORAT
  10   : WEB template    → FLAIX_SUPPORT_NAME / FLAIX_METADATA / FLAIX_LECTORAT
  11   : NL template     → FLAIX_SUPPORT_NAME / FLAIX_METADATA / FLAIX_LECTORAT
  12   : Nos engagements (unchanged)
  13   : A bientôt       (unchanged)

Run:
  cd services/ppt-generator
  python prepare_client_template.py
"""

import copy
import os
from pptx import Presentation
from pptx.util import Pt, Emu
from pptx.dml.color import RGBColor

INPUT_PATH  = os.path.join(os.path.dirname(__file__), "../../ppt templates/Deck PLS PPT 1er Avril.pptx")
OUTPUT_PATH = os.path.join(os.path.dirname(__file__), "pls-ppt-template.pptx")

YELLOW    = RGBColor(0xFE, 0xFF, 0x00)
WHITE     = RGBColor(0xFF, 0xFF, 0xFF)
FONT_NAME = "Montserrat"

# Exact shape names of the 3 example content images to remove
SHAPES_TO_REMOVE = {
    8:  "Google Shape;252;g3d3e5e74262_0_17",  # recap placeholder image
    9:  "Google Shape;263;p10",                  # PRINT example photo
    10: "Google Shape;277;g3d3e5e74262_0_45",   # WEB example screenshot
}


# ─── Utilities ────────────────────────────────────────────────────────────────

def remove_shape_by_name(slide, name):
    for shape in slide.shapes:
        if shape.name == name:
            shape._element.getparent().remove(shape._element)
            print(f"  ✓ Removed: {name!r}")
            return True
    print(f"  ⚠ Not found (skip): {name!r}")
    return False


def rename_shape_by_name(slide, old_name, new_name):
    for shape in slide.shapes:
        if shape.name == old_name:
            shape.name = new_name
            print(f"  ✓ Renamed {old_name!r} → {new_name!r}")
            return True
    print(f"  ⚠ Not found (skip rename): {old_name!r}")
    return False


def find_shape_by_text(slide, fragment):
    for shape in slide.shapes:
        if shape.has_text_frame and fragment in shape.text_frame.text:
            return shape
    return None


def rename_shape_by_text(slide, fragment, new_name):
    shape = find_shape_by_text(slide, fragment)
    if shape:
        print(f"  ✓ Renamed shape containing {fragment!r}: {shape.name!r} → {new_name!r}")
        shape.name = new_name
        return shape
    print(f"  ⚠ No shape found containing {fragment!r}")
    return None


def clear_text_frame(tf):
    for p in list(tf.paragraphs[1:]):
        p._p.getparent().remove(p._p)
    tf.paragraphs[0].clear()


def set_label_value(tf, rows, font_size=Pt(20)):
    """Rebuild a text frame with label:value rows. Label white normal, value yellow bold."""
    clear_text_frame(tf)
    for i, (label, value) in enumerate(rows):
        p = tf.paragraphs[0] if i == 0 else tf.add_paragraph()

        r_label = p.add_run()
        r_label.text = f"{label}\u00a0: "
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


def set_name_shape(shape, placeholder, font_size=Pt(18)):
    """Set a support-name shape to a placeholder token."""
    tf = shape.text_frame
    clear_text_frame(tf)
    p = tf.paragraphs[0]
    r = p.add_run()
    r.text = placeholder
    r.font.name = FONT_NAME
    r.font.size = font_size
    r.font.color.rgb = WHITE
    r.font.bold = True


def set_lectorat_shape(shape, placeholder, font_size=Pt(14)):
    tf = shape.text_frame
    clear_text_frame(tf)
    p = tf.paragraphs[0]
    r_l = p.add_run()
    r_l.text = "Lectorat\u00a0: "
    r_l.font.name = FONT_NAME
    r_l.font.size = font_size
    r_l.font.color.rgb = WHITE
    r_l.font.bold = False
    r_v = p.add_run()
    r_v.text = placeholder
    r_v.font.name = FONT_NAME
    r_v.font.size = font_size
    r_v.font.color.rgb = YELLOW
    r_v.font.bold = True


def find_shape(slide, name):
    for s in slide.shapes:
        if s.name == name:
            return s
    return None


# ─── Slide duplication with relationship copying ──────────────────────────────

def duplicate_slide_with_rels(prs, slide_index):
    """Duplicate a slide correctly, copying all media relationships."""
    template_slide = prs.slides[slide_index]
    new_slide = prs.slides.add_slide(template_slide.slide_layout)

    for ph in list(new_slide.placeholders):
        ph._element.getparent().remove(ph._element)

    R_NS = "http://schemas.openxmlformats.org/officeDocument/2006/relationships"
    rid_map: dict[str, str] = {}
    for rel in template_slide.part.rels.values():
        try:
            if rel.is_external:
                new_rel = new_slide.part.rels.get_or_add_ext_rel(rel.reltype, rel.target_ref)
            else:
                new_rel = new_slide.part.rels.get_or_add(rel.reltype, rel.target_part)
            rid_map[rel.rId] = new_rel.rId
        except Exception:
            pass

    for shape in template_slide.shapes:
        el = copy.deepcopy(shape._element)
        for node in el.iter():
            for attr_name in list(node.attrib):
                if attr_name.startswith(f"{{{R_NS}}}"):
                    old_rid = node.attrib[attr_name]
                    if old_rid in rid_map:
                        node.attrib[attr_name] = rid_map[old_rid]
        new_slide.shapes._spTree.append(el)

    P_NS = "http://schemas.openxmlformats.org/presentationml/2006/main"
    bg = template_slide._element.find(f"{{{P_NS}}}bg")
    if bg is not None:
        new_slide._element.insert(0, copy.deepcopy(bg))

    return new_slide


# ─── Main ─────────────────────────────────────────────────────────────────────

def main():
    print(f"Loading: {INPUT_PATH}")
    prs = Presentation(INPUT_PATH)
    print(f"Loaded {len(prs.slides)} slides\n")

    # ── 1. Remove example content images ──────────────────────────────────────
    print("── Step 1: Remove example content images ──")
    for slide_idx, shape_name in SHAPES_TO_REMOVE.items():
        print(f"Slide {slide_idx + 1}:")
        remove_shape_by_name(prs.slides[slide_idx], shape_name)

    # ── 2. Rename + set placeholders: Slide 8 — Campaign name ─────────────────
    print("\n── Step 2: Slide 8 — Campaign name ──")
    s8 = prs.slides[7]
    shape = rename_shape_by_text(s8, "NOM DE CAMPAGNE", "FLAIX_CAMPAIGN_NAME")
    if shape and shape.has_text_frame:
        # Replace run text directly to preserve existing yellow bold formatting
        for para in shape.text_frame.paragraphs:
            for run in para.runs:
                if run.text.strip():
                    run.text = "{{CAMPAIGN_NAME}}"
                    print("  ✓ Set {{CAMPAIGN_NAME}} placeholder")
                    break

    # ── 3. Rename + set placeholders: Slide 10 — PRINT template ───────────────
    print("\n── Step 3: Slide 10 — PRINT template ──")
    s10 = prs.slides[9]

    rename_shape_by_name(s10, "Google Shape;264;p10", "FLAIX_SUPPORT_NAME")
    rename_shape_by_text(s10, "Canal", "FLAIX_METADATA")
    rename_shape_by_text(s10, "Lectorat", "FLAIX_LECTORAT")

    name_shape = find_shape(s10, "FLAIX_SUPPORT_NAME")
    if name_shape:
        set_name_shape(name_shape, "{{SUPPORT_NAME}}")
        print("  ✓ Set {{SUPPORT_NAME}} placeholder")

    meta_shape = find_shape(s10, "FLAIX_METADATA")
    if meta_shape:
        set_label_value(meta_shape.text_frame, [
            ("Canal",       "{{CANAL}}"),
            ("Périodicité", "{{PERIODICITE}}"),
            ("Diffusion",   "{{DIFFUSION}}"),
        ])
        print("  ✓ Set PRINT metadata placeholders")

    lect_shape = find_shape(s10, "FLAIX_LECTORAT")
    if lect_shape:
        set_lectorat_shape(lect_shape, "{{LECTORAT}}")
        print("  ✓ Set {{LECTORAT}} placeholder")

    # ── 4. Rename + set placeholders: Slide 11 — WEB template ─────────────────
    print("\n── Step 4: Slide 11 — WEB template ──")
    s11 = prs.slides[10]

    rename_shape_by_name(s11, "Google Shape;275;g3d3e5e74262_0_45", "FLAIX_SUPPORT_NAME")
    rename_shape_by_text(s11, "Canal", "FLAIX_METADATA")
    rename_shape_by_text(s11, "Lectorat", "FLAIX_LECTORAT")

    name_shape = find_shape(s11, "FLAIX_SUPPORT_NAME")
    if name_shape:
        set_name_shape(name_shape, "{{SUPPORT_NAME}}")
        print("  ✓ Set {{SUPPORT_NAME}} placeholder")

    meta_shape = find_shape(s11, "FLAIX_METADATA")
    if meta_shape:
        set_label_value(meta_shape.text_frame, [
            ("Canal",              "{{CANAL}}"),
            ("Visite par mois",    "{{VISITES_MOIS}}"),
            ("Pages vues par site","{{PAGES_VUES}}"),
        ])
        print("  ✓ Set WEB metadata placeholders")

    lect_shape = find_shape(s11, "FLAIX_LECTORAT")
    if lect_shape:
        set_lectorat_shape(lect_shape, "{{LECTORAT}}")
        print("  ✓ Set {{LECTORAT}} placeholder")

    # ── 5. Create NL template slide (duplicate of WEB, inserted at index 11) ───
    print("\n── Step 5: Create NL template slide ──")
    # Duplicate the WEB template (currently at index 10 after step 4)
    nl_slide = duplicate_slide_with_rels(prs, 10)
    print("  ✓ Duplicated WEB slide as NL template")

    # Rename NL shapes
    for shape in nl_slide.shapes:
        if shape.name == "FLAIX_METADATA":
            set_label_value(shape.text_frame, [
                ("Canal",           "{{CANAL}}"),
                ("Nombre d'envois", "{{NOMBRE_ENVOIS}}"),
                ("Fréquence",       "{{FREQUENCE}}"),
            ])
            print("  ✓ Set NL metadata placeholders")
        elif shape.name == "FLAIX_SUPPORT_NAME":
            set_name_shape(shape, "{{SUPPORT_NAME}}")
        elif shape.name == "FLAIX_LECTORAT":
            set_lectorat_shape(shape, "{{LECTORAT}}")

    # Reorder: insert NL slide BEFORE engagements (currently at index 11)
    # python-pptx appended NL slide at the end — move it to index 11
    sldIdLst = prs.slides._sldIdLst
    ids = list(sldIdLst)
    # Current order: 0-9 original + 10(WEB now index 10) + 11(engagements) + 12(closing) + 13(NL appended)
    # Target order:  0-10 + NL(11) + engagements(12) + closing(13)
    nl_id = ids[-1]   # appended at end
    eng_id = ids[11]
    clo_id = ids[12]

    new_order = ids[:11] + [nl_id, eng_id, clo_id]
    for sid in list(sldIdLst):
        sldIdLst.remove(sid)
    for sid in new_order:
        sldIdLst.append(sid)
    print("  ✓ Inserted NL slide at index 11")

    # ── Step 6: Add recap shapes to slide 9 ──────────────────────────────────
    print("\n── Step 6: Add FLAIX_RECAP shapes to slide 9 ──")
    s9 = prs.slides[8]

    DARK_NAVY = RGBColor(0x0F, 0x2D, 0x55)
    DARK_GRAY = RGBColor(0x44, 0x44, 0x44)

    # Title shape
    title_box = s9.shapes.add_textbox(Emu(1_000_000), Emu(900_000), Emu(10_000_000), Emu(700_000))
    title_box.name = "FLAIX_RECAP_TITLE"
    tf = title_box.text_frame
    p = tf.paragraphs[0]
    r = p.add_run()
    r.text = "{{RECAP_TITLE}}"
    r.font.name = FONT_NAME
    r.font.size = Pt(28)
    r.font.bold = True
    r.font.color.rgb = DARK_NAVY
    print("  ✓ Added FLAIX_RECAP_TITLE")

    # Fields shape (sample row so styling is baked in)
    fields_box = s9.shapes.add_textbox(Emu(1_500_000), Emu(1_900_000), Emu(9_000_000), Emu(4_200_000))
    fields_box.name = "FLAIX_RECAP_FIELDS"
    fields_box.text_frame.word_wrap = True
    tf2 = fields_box.text_frame
    p2 = tf2.paragraphs[0]
    rl = p2.add_run()
    rl.text = "Label\u00a0: "
    rl.font.name = FONT_NAME
    rl.font.size = Pt(18)
    rl.font.color.rgb = DARK_GRAY
    rl.font.bold = False
    rv = p2.add_run()
    rv.text = "{{VALEUR}}"
    rv.font.name = FONT_NAME
    rv.font.size = Pt(18)
    rv.font.color.rgb = DARK_NAVY
    rv.font.bold = True
    print("  ✓ Added FLAIX_RECAP_FIELDS")

    # ── Save ──────────────────────────────────────────────────────────────────
    prs.save(OUTPUT_PATH)
    size_mb = os.path.getsize(OUTPUT_PATH) / (1024 * 1024)
    print(f"\n✓ Saved: {OUTPUT_PATH} ({size_mb:.1f} MB, {len(prs.slides)} slides)")

    # ── Verification ──────────────────────────────────────────────────────────
    print("\n── Verification ──")
    prs2 = Presentation(OUTPUT_PATH)
    print(f"Total slides: {len(prs2.slides)}")
    for idx in [7, 8, 9, 10, 11]:
        slide = prs2.slides[idx]
        print(f"\nSlide {idx + 1}:")
        for shape in slide.shapes:
            marker = " ← FLAIX" if shape.name.startswith("FLAIX") else ""
            text = ""
            if shape.has_text_frame:
                text = f" | text: {shape.text_frame.text[:60]!r}"
            print(f"  [{shape.shape_type}] {shape.name!r}{marker}{text}")


if __name__ == "__main__":
    main()
