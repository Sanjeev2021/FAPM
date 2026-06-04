"""
Creates a placeholder PPTX template for testing the PPT generation pipeline.

Structure:
  Slides 1-7: Simple corporate placeholder slides
  Slide 8: "Recommandation Intro" — campaign data placeholders
  Slide 9: "Support Template" — per-support data placeholders (cloned by microservice)
  Slide 10: "Closing" — closing slide

Run: python create_placeholder_template.py
Output: pls-ppt-template.pptx
"""

from pptx import Presentation
from pptx.util import Inches, Pt, Emu
from pptx.enum.text import PP_ALIGN
from pptx.dml.color import RGBColor

# Constants
SLIDE_WIDTH = Inches(13.333)
SLIDE_HEIGHT = Inches(7.5)
BRAND_BLUE = RGBColor(0x1A, 0x1A, 0x1A)
BRAND_ACCENT = RGBColor(0x7C, 0x8C, 0xF8)
WHITE = RGBColor(0xFF, 0xFF, 0xFF)
GRAY = RGBColor(0x88, 0x88, 0x88)


def add_text_box(slide, left, top, width, height, text, font_size=18, bold=False, color=BRAND_BLUE, alignment=PP_ALIGN.LEFT):
    txBox = slide.shapes.add_textbox(left, top, width, height)
    tf = txBox.text_frame
    tf.word_wrap = True
    p = tf.paragraphs[0]
    p.text = text
    p.font.size = Pt(font_size)
    p.font.bold = bold
    p.font.color.rgb = color
    p.alignment = alignment
    return txBox


def create_template():
    prs = Presentation()
    prs.slide_width = Emu(12192000)  # 16:9 standard
    prs.slide_height = Emu(6858000)

    blank_layout = prs.slide_layouts[6]  # Blank layout

    # ─── Slides 1-7: Corporate placeholders ───────────────────────
    corporate_titles = [
        "PLS Media — Votre partenaire presse locale",
        "Notre mission",
        "Notre approche",
        "Nos packs média",
        "Chiffres clés",
        "Nos engagements",
        "Notre réseau",
    ]

    for i, title in enumerate(corporate_titles):
        slide = prs.slides.add_slide(blank_layout)
        add_text_box(
            slide,
            Inches(0.8), Inches(0.5), Inches(10), Inches(1),
            title,
            font_size=28, bold=True, color=BRAND_BLUE
        )
        add_text_box(
            slide,
            Inches(0.8), Inches(2), Inches(10), Inches(3),
            f"[Corporate slide {i+1} — content preserved from original template]",
            font_size=14, color=GRAY
        )
        add_text_box(
            slide,
            Inches(0.8), Inches(6), Inches(4), Inches(0.5),
            "PLS MEDIA — Confidentiel",
            font_size=10, color=GRAY
        )

    # ─── Slide 8: Recommandation Intro ────────────────────────────
    slide = prs.slides.add_slide(blank_layout)
    add_text_box(
        slide,
        Inches(0.8), Inches(0.3), Inches(5), Inches(0.5),
        "RECOMMANDATION",
        font_size=12, bold=True, color=BRAND_ACCENT
    )
    add_text_box(
        slide,
        Inches(0.8), Inches(1.0), Inches(10), Inches(1.2),
        "CAMPAIGN_NAME",
        font_size=36, bold=True, color=BRAND_BLUE, alignment=PP_ALIGN.LEFT
    )
    add_text_box(
        slide,
        Inches(0.8), Inches(2.5), Inches(5), Inches(0.5),
        "AGENCY_NAME",
        font_size=16, color=GRAY
    )
    add_text_box(
        slide,
        Inches(0.8), Inches(3.2), Inches(5), Inches(0.5),
        "ADVERTISER_NAME",
        font_size=16, color=GRAY
    )
    add_text_box(
        slide,
        Inches(0.8), Inches(4.2), Inches(10), Inches(2),
        "CAMPAIGN_CONTEXT",
        font_size=14, color=BRAND_BLUE
    )

    # ─── Slide 9: Support Template (cloned per support) ───────────
    slide = prs.slides.add_slide(blank_layout)
    add_text_box(
        slide,
        Inches(0.8), Inches(0.3), Inches(8), Inches(0.8),
        "SUPPORT_NAME",
        font_size=28, bold=True, color=BRAND_BLUE
    )
    # Visual placeholder area
    add_text_box(
        slide,
        Inches(0.8), Inches(1.5), Inches(4.5), Inches(3),
        "VISUAL_PLACEHOLDER",
        font_size=14, color=GRAY, alignment=PP_ALIGN.CENTER
    )
    # Right column — metadata
    add_text_box(
        slide,
        Inches(6.0), Inches(1.5), Inches(5), Inches(0.5),
        "SUPPORT_DIFFUSION",
        font_size=14, color=BRAND_BLUE
    )
    add_text_box(
        slide,
        Inches(6.0), Inches(2.2), Inches(5), Inches(0.5),
        "SUPPORT_FORMAT",
        font_size=14, color=BRAND_BLUE
    )
    add_text_box(
        slide,
        Inches(6.0), Inches(2.9), Inches(5), Inches(0.5),
        "SUPPORT_PERIOD",
        font_size=14, color=BRAND_BLUE
    )
    add_text_box(
        slide,
        Inches(6.0), Inches(3.6), Inches(5), Inches(0.5),
        "SUPPORT_BUDGET",
        font_size=14, bold=True, color=BRAND_ACCENT
    )
    add_text_box(
        slide,
        Inches(0.8), Inches(5.0), Inches(10), Inches(1.5),
        "SUPPORT_ARGUMENT",
        font_size=13, color=BRAND_BLUE
    )

    # ─── Slide 10: Closing ────────────────────────────────────────
    slide = prs.slides.add_slide(blank_layout)
    add_text_box(
        slide,
        Inches(1), Inches(2.5), Inches(10), Inches(1.5),
        "À bientôt sur votre prochain brief BtoB",
        font_size=32, bold=True, color=BRAND_BLUE, alignment=PP_ALIGN.CENTER
    )
    add_text_box(
        slide,
        Inches(1), Inches(4.5), Inches(10), Inches(0.5),
        "PLS Media — contact@plsmedia.fr",
        font_size=14, color=GRAY, alignment=PP_ALIGN.CENTER
    )

    # Save
    output_path = "pls-ppt-template.pptx"
    prs.save(output_path)
    print(f"Template created: {output_path} ({len(prs.slides)} slides)")


if __name__ == "__main__":
    create_template()
