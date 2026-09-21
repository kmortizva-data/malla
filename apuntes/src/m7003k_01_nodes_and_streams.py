# -*- coding: utf-8 -*-
"""Study note M7003K 01 - Nodes and streams.

Builds M7003K/notes/01_nodes_and_streams.pdf: the product balance and the
water balance worked end to end, for the Canvas assignment "Product and
Water Balances" (ProductWaterBalances.pdf + ProductWaterBalances-1.xlsx),
the circuit-balancing computer lab, and exam topics T9, T10 and T11.

Numbers and wording follow Malla's own lesson (M7003K/lessons/
m4_circuit_balancing.html) and review topics T9, T10 and T11, so the note
and the site never drift apart.

    python3 apuntes/src/m7003k_01_nodes_and_streams.py
"""

import os

from reportlab.lib import colors
from reportlab.lib.enums import TA_CENTER, TA_LEFT, TA_RIGHT
from reportlab.lib.pagesizes import A4
from reportlab.lib.styles import ParagraphStyle
from reportlab.lib.units import mm
from reportlab.pdfbase import pdfmetrics
from reportlab.pdfbase.ttfonts import TTFont
from reportlab.platypus import (BaseDocTemplate, Frame, KeepTogether, NextPageTemplate,
                                PageTemplate, Paragraph, Spacer, Table, TableStyle)

# --------------------------------------------------------------------------
# palette (data/hub.json -> palette.courses.M7003K.light, palette.bg.light)
# --------------------------------------------------------------------------
ACCENT = colors.HexColor("#497856")
ACCENT_SOFT = colors.HexColor("#E4EDE6")
INK = colors.HexColor("#1B211D")
MUTED = colors.HexColor("#5C665F")
RULE = colors.HexColor("#CBD4CC")
PAPER = colors.HexColor("#F6F4EF")

DEJAVU = "/usr/share/fonts/truetype/dejavu"
FONTS = {
    "body": ("NoteSerif", "DejaVuSerif.ttf"),
    "bodyb": ("NoteSerif-Bold", "DejaVuSerif-Bold.ttf"),
    "sans": ("NoteSans", "DejaVuSans.ttf"),
    "sansb": ("NoteSans-Bold", "DejaVuSans-Bold.ttf"),
    "mono": ("NoteMono", "DejaVuSansMono.ttf"),
}
for _key, (_name, _file) in FONTS.items():
    pdfmetrics.registerFont(TTFont(_name, os.path.join(DEJAVU, _file)))
BODY, BODYB = FONTS["body"][0], FONTS["bodyb"][0]
SANS, SANSB, MONO = FONTS["sans"][0], FONTS["sansb"][0], FONTS["mono"][0]

TITLE = "Nodes and streams"
SUBTITLE = "The product balance and the water balance, step by step"
COURSE = "M7003K · Mineral Processing · study note 01"

# --------------------------------------------------------------------------
# styles
# --------------------------------------------------------------------------
S = {}
S["h1"] = ParagraphStyle("h1", fontName=SANSB, fontSize=15.5, leading=19,
                         textColor=ACCENT, spaceBefore=11, spaceAfter=4, keepWithNext=1)
S["h2"] = ParagraphStyle("h2", fontName=SANSB, fontSize=10.6, leading=14,
                         textColor=INK, spaceBefore=9, spaceAfter=3, keepWithNext=1)
S["p"] = ParagraphStyle("p", fontName=BODY, fontSize=9.3, leading=13.6,
                        textColor=INK, spaceAfter=5, alignment=TA_LEFT)
S["lead"] = ParagraphStyle("lead", parent=S["p"], fontSize=10.0, leading=15.2,
                           textColor=MUTED, spaceAfter=7)
S["li"] = ParagraphStyle("li", parent=S["p"], leftIndent=11, bulletIndent=1,
                         spaceAfter=2.6)
S["step"] = ParagraphStyle("step", parent=S["p"], leftIndent=11, spaceBefore=4,
                           spaceAfter=3)
S["eq"] = ParagraphStyle("eq", fontName=BODY, fontSize=9.9, leading=15,
                         textColor=ACCENT, alignment=TA_CENTER,
                         spaceBefore=4, spaceAfter=6)
S["cap"] = ParagraphStyle("cap", fontName=SANS, fontSize=7.9, leading=10.6,
                          textColor=MUTED, spaceBefore=2, spaceAfter=8)
S["cell"] = ParagraphStyle("cell", fontName=BODY, fontSize=7.9, leading=10.2,
                           textColor=INK)
S["cellb"] = ParagraphStyle("cellb", parent=S["cell"], fontName=BODYB)
S["celln"] = ParagraphStyle("celln", parent=S["cell"], alignment=TA_RIGHT)
S["cellnb"] = ParagraphStyle("cellnb", parent=S["cellb"], alignment=TA_RIGHT)
S["cellhn"] = ParagraphStyle("cellhn", parent=None, fontName=SANSB, fontSize=7.6,
                             leading=9.8, textColor=colors.white, alignment=TA_RIGHT)
S["cellh"] = ParagraphStyle("cellh", fontName=SANSB, fontSize=7.6, leading=9.8,
                            textColor=colors.white)
S["note"] = ParagraphStyle("note", parent=S["p"], fontSize=8.9, leading=13.0,
                           leftIndent=8, rightIndent=8, spaceBefore=3,
                           spaceAfter=3, textColor=INK)

B = lambda t: '<font name="%s">%s</font>' % (BODYB, t)          # noqa: E731
A = lambda t: '<font color="#497856">%s</font>' % t             # noqa: E731
M = lambda t: '<font name="%s" size="8.4">%s</font>' % (MONO, t)  # noqa: E731

# --------------------------------------------------------------------------
# flowable helpers
# --------------------------------------------------------------------------
def h1(t):
    return Paragraph(t, S["h1"])


def h2(t):
    return Paragraph(t, S["h2"])


def p(t, style="p"):
    return Paragraph(t, S[style])


def eq(t):
    return Paragraph(t, S["eq"])


def step(n, t):
    return Paragraph("%s &nbsp;%s" % (B("Step %s." % n), t), S["step"])


def bullets(items):
    return [Paragraph(t, S["li"], bulletText="•") for t in items]


def callout(title, body):
    inner = [Paragraph(B(title), S["note"]), Paragraph(body, S["note"])]
    t = Table([[inner]], colWidths=[165 * mm])
    t.setStyle(TableStyle([
        ("BACKGROUND", (0, 0), (-1, -1), ACCENT_SOFT),
        ("LEFTPADDING", (0, 0), (-1, -1), 7),
        ("RIGHTPADDING", (0, 0), (-1, -1), 7),
        ("TOPPADDING", (0, 0), (-1, -1), 5),
        ("BOTTOMPADDING", (0, 0), (-1, -1), 5),
        ("LINEBEFORE", (0, 0), (0, -1), 2.2, ACCENT),
    ]))
    return [Spacer(1, 3), t, Spacer(1, 7)]


def table(head, rows, widths, caption=None, bold_rows=(), numeric=True):
    """A data table. numeric=True right-aligns every column but the first."""
    def cell(text, col, bold):
        if numeric and col > 0:
            return Paragraph(text, S["cellnb"] if bold else S["celln"])
        return Paragraph(text, S["cellb"] if bold else S["cell"])

    data = [[Paragraph(c, S["cellhn"] if (numeric and i) else S["cellh"])
             for i, c in enumerate(head)]]
    for i, r in enumerate(rows):
        bold = i in bold_rows
        data.append([cell(c, j, bold) for j, c in enumerate(r)])
    t = Table(data, colWidths=widths, repeatRows=1, hAlign="LEFT")
    style = [
        ("BACKGROUND", (0, 0), (-1, 0), ACCENT),
        ("VALIGN", (0, 0), (-1, -1), "MIDDLE"),
        ("LEFTPADDING", (0, 0), (-1, -1), 4.5),
        ("RIGHTPADDING", (0, 0), (-1, -1), 4.5),
        ("TOPPADDING", (0, 0), (-1, -1), 2.9),
        ("BOTTOMPADDING", (0, 0), (-1, -1), 2.9),
        ("LINEBELOW", (0, 0), (-1, -2), 0.4, RULE),
    ]
    for i in range(1, len(data)):
        if i % 2 == 0:
            style.append(("BACKGROUND", (0, i), (-1, i), colors.HexColor("#F1F4F1")))
    for i in bold_rows:
        style.append(("LINEABOVE", (0, i + 1), (-1, i + 1), 0.9, ACCENT))
    t.setStyle(TableStyle(style))
    block = [t]
    if caption:
        block.append(Paragraph(caption, S["cap"]))
    return [Spacer(1, 3), KeepTogether(block), Spacer(1, 0 if caption else 7)]


def flow(boxes, caption):
    """A one-line block diagram: boxes joined by arrows."""
    cells, widths = [], []
    for i, b in enumerate(boxes):
        if i:
            cells.append(Paragraph('<font color="#497856">→</font>',
                                   ParagraphStyle("ar", fontName=SANS, fontSize=11,
                                                  alignment=TA_CENTER, leading=13)))
            widths.append(7 * mm)
        cells.append(Paragraph(b, ParagraphStyle(
            "bx", fontName=SANS, fontSize=7.8, leading=10, alignment=TA_CENTER,
            textColor=INK)))
        widths.append((165 - 7 * (len(boxes) - 1)) / len(boxes) * mm)
    t = Table([cells], colWidths=widths, hAlign="LEFT")
    sty = [("VALIGN", (0, 0), (-1, -1), "MIDDLE"),
           ("TOPPADDING", (0, 0), (-1, -1), 5),
           ("BOTTOMPADDING", (0, 0), (-1, -1), 5)]
    for i in range(0, len(cells), 2):
        sty += [("BOX", (i, 0), (i, 0), 0.7, ACCENT),
                ("BACKGROUND", (i, 0), (i, 0), ACCENT_SOFT)]
    t.setStyle(TableStyle(sty))
    return [Spacer(1, 3), t, Paragraph(caption, S["cap"])]


# --------------------------------------------------------------------------
# the note
# --------------------------------------------------------------------------
def story():
    s = []

    # ---------------------------------------------------------------- intro
    s.append(p(
        "One assignment, one lab and three exam topics are the same piece of "
        "arithmetic seen from different sides. Canvas calls it "
        + B("Product and Water Balances") + " (the sheet "
        + M("ProductWaterBalances.pdf") + " with the workbook "
        + M("ProductWaterBalances-1.xlsx") + "); the Friday computer class calls it "
        "circuit balancing with HSC Sim; the written exam calls it T9, T10 and T11. "
        "This note works the whole thing end to end on the numbers the course "
        "itself uses, in the order that never gets stuck.", "lead"))

    s.append(p(
        "Read it with the workbook open. Every section ends with the check that "
        "tells you whether the sheet is right, because a balance that does not "
        "close is the only error message this arithmetic gives you."))

    s += callout(
        "The one rule underneath all of it",
        "Draw a box. At steady state nothing accumulates inside it, so for every "
        "quantity that is conserved, what enters equals what leaves. Solids are "
        "conserved, each element is conserved, water is conserved. Particle size "
        "is not. Grades are conserved only if the minerals are not transformed.")

    # ------------------------------------------------------- 1 nodes/streams
    s.append(h1("1 · Nodes and streams: draw the box before you type"))

    s.append(p(
        "A " + B("node") + " is any point where streams meet or split: a separator "
        "(one in, two out), a mixer (two in, one out), a machine. A " + B("stream") +
        " is an arrow between two nodes, or between a node and the outside world. "
        "The input file of HSC Sim, and the left-hand column of the Excel sheet, "
        "are nothing but that numbering written down. Number the streams on paper "
        "first; the lab sheet asks for a simplified block diagram with numbered "
        "nodes and streams for exactly this reason."))

    s.append(p("Every node gives you equations, and you should count them before you start:"))
    s += bullets([
        "one " + B("solids") + " balance per node;",
        "one balance per " + B("element") + " assayed, per node;",
        "one " + B("water") + " balance per node, once you have the dilution ratios.",
    ])

    s.append(h2("Choosing the box is the whole skill"))
    s.append(p(
        "Three boxes drawn on the same circuit give three different, equally true "
        "balances. Around the whole plant only the feed, the concentrate and the "
        "tail cross the line, and the recycle never appears. Around the mill alone "
        "the recycle is the biggest stream there is."))

    s += flow(["Fresh feed F", "Mill", "Cyclone", "Overflow = product"],
              "Box A, the whole circuit: product = F, and the recycle is invisible. "
              "Box B, the mill only: discharge = F + R. Same plant, two true statements.")

    s += callout(
        "In plain words",
        "Choose the box so that the unknown you want crosses its edge, and as few "
        "other unknowns as possible. Around the whole circuit the recycle vanishes, "
        "which is what you want when you are after the products. Around one unit "
        "the recycle appears, which is what you want when you are after the "
        "circulating load.")

    s.append(h2("Normal and non-normal nodes"))
    s.append(p(
        "A " + B("normal") + " node splits one stream into two, or merges two into "
        "one, and carries compositional information. A mill has one feed and one "
        "discharge with the same composition, so it separates nothing: that is a "
        + B("non-normal") + " node, and grinding circuits are full of them. They are "
        "not an error. They simply give you a solids balance and no useful element "
        "balance, so do not expect assays to pin the split there."))

    # ------------------------------------------------------ 2 product balance
    s.append(h1("2 · The product balance"))

    s.append(p(
        "You weigh the feed and you assay everything, but you rarely weigh the "
        "products. The feed tonnage plus the assays are enough. With a feed of "
        "M<sub>f</sub> tonnes and n products:"))
    s.append(eq("M<sub>f</sub> = ∑ M<sub>i</sub> &nbsp;&nbsp;and&nbsp;&nbsp; "
                "M<sub>f</sub> a<sub>f</sub> = ∑ M<sub>i</sub> a<sub>i</sub>"))
    s.append(p(
        "One solids balance, plus one element balance for every product beyond the "
        "first. In matrix form A p = m, where the first row of A is all ones and "
        "each further row holds one element's assays; the answer is p = A<sup>-1</sup> m. "
        "The course's " + M("PRODUCT.XLS") + " does this for up to five products, and "
        "the assignment template is the same machine with the columns already drawn."))

    s += callout(
        "Which element for which product",
        "One element per product beyond the first, and the natural choice is each "
        "concentrate's own main metal: copper for the copper concentrate, zinc for "
        "the zinc concentrate. That is where the grade contrast between streams is "
        "largest, and contrast is what pins the split. An element with the same "
        "grade everywhere tells you nothing about the masses.")

    s.append(h2("The two-product formula"))
    s.append(p(
        "When a unit or a whole plant makes only two products, the solids balance "
        "and one element balance solve in closed form. With grades f, c and t:"))
    s.append(eq("C / F = (f − t) / (c − t) &nbsp;&nbsp;&nbsp;&nbsp; "
                "R = c (f − t) / [ f (c − t) ] × 100"))
    s.append(p(
        "The concentrate mass is the feed times how far the feed grade sits between "
        "the tail and the concentrate. The recovery needs no tonnage at all, only "
        "three assays, which is why plants quote it every shift. Its weak point is "
        "the denominator c − t: with little contrast, a small assay error moves "
        "the answer a long way."))

    s.append(h2("The three numbers the worksheet asks for at the end"))
    s += bullets([
        B("Recovery R") + " — the share of a metal in the feed that reached its "
        "own concentrate, R = M<sub>c</sub> c / (M<sub>f</sub> f) × 100.",
        B("Concentrator difference") + " — metal in minus metal out. For the "
        "element whose assays sized the streams it is zero " + B("by construction") +
        "; for every other element it is a real number, and it measures how well "
        "sampling and assaying hang together.",
        B("Concentrator loss") + " — metal that did not reach its own "
        "concentrate, per tonne of feed. Two definitions circulate: the final tail "
        "only, or the tail plus what was misplaced in the other concentrate. The "
        "examiner uses the second. " + B("Say which one you used.") + "",
    ])

    # -------------------------------------------- 3 worked: recoveries given
    s.append(h1("3 · Worked: recoveries given (Pb–Zn–Ag, 110 000 t/month)"))
    s.append(p(
        "Selective flotation: lead first, then zinc from the lead-circuit tail. "
        "Four streams cross the worksheet. Feed 110 000 t/month at 1.50 % Pb, "
        "8.00 % Zn, 30 g/t Ag. Lead cake 70.0 % Pb at R = 90.5 %, 890 g/t Ag. "
        "Zinc cake 55.0 % Zn at R = 96 %, 50 g/t Ag. Final tail 0.10 % Pb, "
        "0.30 % Zn, 5 g/t Ag."))

    s += flow(["Feed 110 000 t", "Pb flotation", "Zn flotation", "Final tail"],
              "Lead cake leaves the first node, zinc cake the second; the lead-circuit "
              "tail (mpPb) is the internal stream that feeds zinc flotation.")

    s.append(step(1, "Metal in the feed. Mass times grade: 110 000 × 1.50 % = "
                     "1 650 t Pb, × 8.00 % = 8 800 t Zn, × 30 g/t = 3 300 kg Ag."))
    s.append(step(2, "Concentrate masses from the recoveries. A recovery fixes the "
                     "metal in the concentrate; the grade then fixes the mass."))
    s.append(eq("m<sub>Pb cake</sub> = 0.905 × 1 650 / 0.700 = 1 493.25 / 0.700 = "
                + B("2 133.2 t")))
    s.append(eq("m<sub>Zn cake</sub> = 0.96 × 8 800 / 0.550 = 8 448 / 0.550 = "
                + B("15 360.0 t")))
    s.append(step(3, "The intermediate stream and the tail, by difference. "
                     "mpPb = 110 000 − 2 133.2 = 107 866.8 t; final tail = "
                     "107 866.8 − 15 360.0 = " + B("92 506.8 t") + "."))
    s.append(step(4, "Fill the metal columns. The tail grades are given: 92 506.8 "
                     "× 0.10 % = 92.51 t Pb, × 0.30 % = 277.52 t Zn, "
                     "× 5 g/t = 462.5 kg Ag. The grades that are " + B("not") +
                     " given come out by difference, so the two elements whose "
                     "recoveries you used close exactly:"))
    s.append(eq("Zn in the Pb cake = 8 800 − 8 448 − 277.52 = 74.48 t "
                "⇒ 74.48 / 2 133.2 = 3.49 % Zn"))
    s.append(eq("Pb in the Zn cake = 1 650 − 1 493.25 − 92.51 = 64.24 t "
                "⇒ 64.24 / 15 360 = 0.42 % Pb"))
    s.append(step(5, "Silver, the by-product. Its grades are given everywhere, so it "
                     "does " + B("not") + " close. Pb cake 2 133.2 × 890 = 1 898.6 kg; "
                     "Zn cake 15 360 × 50 = 768.0 kg; tail 462.5 kg; sum 3 129.1 kg "
                     "against 3 300 kg fed. Concentrator difference = −170.9 kg, "
                     "about 2 g/t of feed: the assays do not account for 5 % of the silver."))
    s.append(step(6, "Closing numbers. Difference = 0 for Pb and Zn by construction. "
                     "Loss, examiner's definition: Pb (92.51 + 64.24) / 110 000 = "
                     "1.43 kg/t; Zn (277.52 + 74.48) / 110 000 = 3.20 kg/t. Counting "
                     "the final tail alone gives 0.84 and 2.52 kg/t."))

    s += table(
        ["Product", "Dry weight t", "Ag g/t", "Ag kg", "Pb %", "Pb t", "Zn %", "Zn t"],
        [["Feed ore", "110 000.0", "30", "3 300.0", "1.50", "1 650.0", "8.00", "8 800.0"],
         ["Pb cake", "2 133.2", "890", "1 898.6", "70.00", "1 493.3", "3.49", "74.5"],
         ["Zn cake", "15 360.0", "50", "768.0", "0.42", "64.2", "55.00", "8 448.0"],
         ["Final tail", "92 506.8", "5", "462.5", "0.10", "92.5", "0.30", "277.5"],
         ["Σ products", "110 000.0", "28", "3 129.1", "1.50", "1 650.0", "8.00", "8 800.0"],
         ["Concentrator difference", "", "−2", "−170.9", "0.00", "0.0", "0.00", "0.0"]],
        [34 * mm, 22 * mm, 16 * mm, 20 * mm, 16 * mm, 20 * mm, 16 * mm, 21 * mm],
        "Silver distribution: 60.7 % to the lead cake, 24.5 % to the zinc cake. "
        "Concentrator loss 11.19 g/t Ag when the difference is counted as lost metal.",
        bold_rows=(4, 5))

    # ----------------------------------------- 4 worked: only grades given
    s.append(h1("4 · Worked: only grades given (Aitik, 92 500 t/day)"))
    s.append(p(
        "No recoveries this time, only grades, and three elements. The masses come "
        "from the two-product formula applied twice, on copper, the element with the "
        "biggest contrast. Gold and sulphur then ride along on those masses, and "
        "their concentrator differences are real numbers, not zero. The scavenger "
        "concentrate returns to the rougher and never leaves, so it does not appear "
        "in the products balance at all."))

    s.append(step(1, "Rougher–scavenger section, two-product formula on copper. "
                     "Feed 0.28 % Cu, rougher concentrate 12.0 %, scavenger tail 0.022 %:"))
    s.append(eq("M<sub>rougher conc</sub> = 92 500 × (0.28 − 0.022) / "
                "(12.0 − 0.022) = 92 500 × 0.258 / 11.978 = " + B("1 992.4 t")))
    s.append(p("Scavenger tail = 92 500 − 1 992.4 = 90 507.6 t.", "step"))
    s.append(step(2, "Cleaner section, the same formula again. Its feed is the rougher "
                     "concentrate (12.0 %); products final concentrate (29.0 %) and "
                     "cleaner tail (0.39 %):"))
    s.append(eq("M<sub>final conc</sub> = 1 992.4 × (12.0 − 0.39) / "
                "(29.0 − 0.39) = 1 992.4 × 11.61 / 28.61 = " + B("808.5 t")))
    s.append(p("Cleaner tail = 1 992.4 − 808.5 = 1 183.9 t.", "step"))
    s.append(step(3, "Metal columns from the grades: every mass times every grade, "
                     "gold in g/t to kg, copper and sulphur in t."))

    s += table(
        ["Product", "Dry mass t", "Au g/t", "Au kg", "Cu %", "Cu t", "S %", "S t"],
        [["Feed ore", "92 500.0", "0.30", "27.75", "0.28", "259.00", "1.20", "1 110.0"],
         ["Final conc", "808.5", "9.2", "7.44", "29.0", "234.47", "31.0", "250.6"],
         ["Cleaner tail", "1 183.9", "2.4", "2.84", "0.39", "4.62", "1.10", "13.0"],
         ["Scavenger tail", "90 507.6", "0.10", "9.05", "0.022", "19.91", "0.90", "814.6"],
         ["Σ products", "92 500.0", "", "19.33", "", "259.00", "", "1 078.2"],
         ["Concentrator difference", "", "", "8.42", "", "0.00", "", "31.8"]],
        [34 * mm, 22 * mm, 16 * mm, 20 * mm, 16 * mm, 20 * mm, 16 * mm, 21 * mm],
        bold_rows=(4, 5))

    s.append(p(
        B("Reading the differences.") + " Copper closes at zero because its grades "
        "sized the streams. Gold is short by 8.42 kg, 30 % of what was fed: a feed "
        "assay of 0.3 g/t sits near the detection limit and does not hang together "
        "with copper-based masses. Sulphur is short by 31.8 t, 2.9 %, an ordinary "
        "assay mismatch. Recoveries: Cu 90.5 %, Au 26.8 %, S 22.6 %. Losses: "
        "Cu 0.265 kg/t, Au 0.129 g/t, S 8.95 kg/t."))

    # ------------------------------------------------------- 5 water balance
    s.append(h1("5 · The water balance"))

    s.append(p(
        "Slurry streams are described by the " + B("dilution ratio") + ", the mass of "
        "water per mass of solids. One cubic metre of water is one tonne, so litres "
        "of water per kilogram of solids is the same number. Everything else is a "
        "rearrangement of it:"))
    s.append(eq("D = W / M &nbsp;&nbsp;&nbsp; W = D · M &nbsp;&nbsp;&nbsp; "
                "F<sub>w</sub> = 100 / (1 + D) &nbsp;&nbsp;&nbsp; D = 100 / F<sub>w</sub> − 1"))
    s.append(p(
        "F<sub>w</sub> is the weight per cent solids. The pulp density a Marcy scale "
        "reads, with water at 1 and solids at ρ<sub>s</sub>:"))
    s.append(eq("ρ<sub>p</sub> = (D + 1) / (D + 1/ρ<sub>s</sub>) &nbsp;&nbsp;&nbsp;&nbsp; "
                "D = (ρ<sub>s</sub> − ρ<sub>p</sub>) / [ ρ<sub>s</sub> (ρ<sub>p</sub> − 1) ]"))

    s += callout(
        "D is an exchange rate",
        "It converts the tonnes you know into the water you want. D = 2 is one third "
        "solids by weight. A cyclone underflow at D = 0.4 is thick pulp. A thickener "
        "overflow at D = 36 is almost clear water. A dry feed has D = 0.")

    s.append(h2("The order that never gets stuck"))
    s.append(p(
        "Every water-balance question in this course yields to the same five moves, "
        "in this order. Write each balance as an equation before you put numbers in "
        "it; the examiner says so on the cover."))
    s += bullets([
        B("Solids around the whole circuit.") + " At steady state what goes in comes "
        "out. Find the product streams first; the recycle is invisible from here.",
        B("Solids around each unit.") + " Now the recycle appears, one unit at a time, "
        "by difference.",
        B("Circulating load.") + " The solids that return to the mill divided by the "
        "fresh feed, times 100.",
        B("Water around the whole circuit.") + " All the fresh water added leaves with "
        "the products. That single equation usually gives the first unknown D.",
        B("Water around each unit,") + " then " + B("check") + " on a box you have not "
        "used yet. If the two sides agree, all your answers are consistent.",
    ])
    s.append(eq("CL = M<sub>recycle</sub> / M<sub>fresh feed</sub> × 100"))
    s.append(p(
        "A circulating load of 200 % means the mill discharges three tonnes for every "
        "fresh tonne fed. It is always the last line of the question, because the "
        "recycle tonnage is what the water balance was hunting for."))

    # ------------------------------------ 6 worked: pilot circuit water balance
    s.append(h1("6 · Worked: the pilot circuit (mill, cyclone, Wright Impact Tray)"))
    s.append(p(
        "Feed 14.3 kg/min of dry ore. Mill water 8.5 l/min. Cyclone underflow "
        "29.5 kg/min at D = 0.37. WIT concentrate 3.2 kg/min at D = 0.92, with "
        "10.7 and 9.0 l/min added on the two decks. Asked: the dilution ratios of "
        "the cyclone overflow, the cyclone feed and the WIT tailings, and the "
        "circulating load."))

    s += flow(["Feed 14.3 kg/min", "Mill", "Cyclone", "WIT, 2 decks"],
              "Cyclone overflow and WIT concentrate are the only streams that leave. "
              "The WIT tailings go back to the mill: that is the recycle.")

    s.append(step(1, "Solids around the whole circuit. Only two streams leave: "
                     "overflow = 14.3 − 3.2 = " + B("11.1 kg/min") + "."))
    s.append(step(2, "Solids around each unit. Cyclone: feed = 29.5 + 11.1 = "
                     "40.6 kg/min. WIT: it receives the underflow (29.5) and splits it "
                     "into concentrate (3.2) and tailings, 29.5 − 3.2 = 26.3 kg/min "
                     "back to the mill."))
    s.append(step(3, "Circulating load."))
    s.append(eq("CL = 26.3 / 14.3 × 100 = " + B("184 %")))
    s.append(step(4, "Water around the whole circuit. All the fresh water, "
                     "8.5 + 9.0 + 10.7 = 28.2 l/min, leaves with the two products:"))
    s.append(eq("W<sub>overflow</sub> = 28.2 − 3.2 × 0.92 = 25.26 l/min &nbsp;⇒&nbsp; "
                "D<sub>overflow</sub> = 25.26 / 11.1 = " + B("2.28")))
    s.append(step(5, "Water around the cyclone. Its feed water is the sum of the two "
                     "outlets:"))
    s.append(eq("W<sub>cyclone feed</sub> = 29.5 × 0.37 + 25.26 = 36.17 &nbsp;⇒&nbsp; "
                "D<sub>cyclone feed</sub> = 36.17 / 40.6 = " + B("0.89")))
    s.append(step(6, "Water around the WIT. In: the underflow water plus the two "
                     "additions. Out: concentrate and tailings."))
    s.append(eq("W<sub>tailings</sub> = 10.92 + 9.0 + 10.7 − 2.94 = 27.67 &nbsp;⇒&nbsp; "
                "D<sub>tailings</sub> = 27.67 / 26.3 = " + B("1.05")))
    s.append(step(7, "Close the loop, on a box you have not used. Mill water in = "
                     "8.5 fresh + 27.67 from the tailings = 36.17, which is the cyclone "
                     "feed water found in step 5. The balance closes, so the three "
                     "answers are consistent."))

    s += table(
        ["Stream", "Solids kg/min", "Water l/min", "D"],
        [["Feed ore", "14.3", "0", "0"],
         ["Cyclone feed", "40.6", "36.2", "0.89"],
         ["Cyclone underflow", "29.5", "10.9", "0.37"],
         ["Cyclone overflow (product)", "11.1", "25.3", "2.28"],
         ["WIT concentrate (product)", "3.2", "2.9", "0.92"],
         ["WIT tailings (to mill)", "26.3", "27.7", "1.05"]],
        [58 * mm, 32 * mm, 32 * mm, 26 * mm],
        "The 2020 and 2022 papers are the same circuit with 15.8 kg/min of feed and "
        "10.0 l/min of mill water; everything else is identical.")

    # ------------------------------- 7 worked: three-mill grinding circuit
    s.append(h1("7 · Worked: the three-mill grinding circuit"))
    s.append(p(
        "The hardest of the water balances and the most like a real plant: a rod mill, "
        "two ball mills, two cyclones, water added at the feed and at the discharge of "
        "every mill. The table gives a dilution ratio for every pumped stream, so each "
        "mill can be balanced on its own once its solids are known."))

    s += callout(
        "Read the table before you trust it",
        "The row “Pump, 0.76” is the rod-mill discharge as it is pumped. "
        "“Feed cyclone 2, 0.84” is that same pulp after the ball-mill-2 "
        "discharge has joined it. Only with this reading are there as many equations "
        "as unknowns. State the reading in your answer: interpreting the flowsheet is "
        "part of the marks.")

    s.append(p(
        "Feed 52.5 t/h at 4.57 % moisture. Moisture is on the " + B("wet") + " mass, "
        "so the water in the feed is 52.5 × 4.57 / 95.43 = 2.51 m³/h."))
    s.append(step("c", "Solids to each cyclone first; this is the backbone. Cyclone 2 "
                       "feed = rod-mill discharge 52.5 + ball-mill-2 discharge 31.2 = "
                       "83.7 t/h, and its overflow is 52.5 t/h, the fresh feed again. "
                       "Cyclone 3 feed = 52.5 + 24.1 = 76.6 t/h, overflow 52.5 t/h to "
                       "flotation. Nothing accumulates."))
    s.append(step("a", "Water added at each mill feed, working along the pulp."))
    s += bullets([
        B("Rod mill.") + " Discharge water = 52.5 × 0.76 = 39.90. In: 2.51 moisture "
        "+ x₁ + 12.9 added at the discharge. So x₁ = 39.90 − 2.51 − 12.9 = "
        + B("24.5 m³/h") + ".",
        B("Ball mill 2.") + " Cyclone 2 feed water = 83.7 × 0.84 = 70.31, so ball mill 2 "
        "brings 70.31 − 39.90 = 30.41. In: underflow water 31.2 × 0.38 = 11.86, plus x₂, "
        "plus 5.9. So x₂ = 30.41 − 11.86 − 5.9 = " + B("12.7 m³/h") + ".",
        B("Ball mill 3.") + " Cyclone 2 overflow water = 70.31 − 11.86 = 58.45. Cyclone 3 "
        "feed water = 76.6 × 1.04 = 79.66, so ball mill 3 brings 21.21. In: underflow "
        "24.1 × 0.57 = 13.74 plus x₃. So x₃ = " + B("7.5 m³/h") + ".",
    ])
    s.append(step("b", "Dilution ratio of the flotation feed. Cyclone 3 overflow water "
                       "= 79.66 − 13.74 = 65.93 m³/h with 52.5 t/h:"))
    s.append(eq("D<sub>flotation feed</sub> = 65.93 / 52.5 = " + B("1.26") + " &nbsp;(44 % solids)"))
    s.append(p(
        B("Check.") + " Total water added = 2.51 + 24.5 + 12.9 + 12.7 + 5.9 + 7.5 = "
        "65.9 m³/h, exactly the water leaving with the flotation feed. Closed."))

    s += table(
        ["Stream", "Solids t/h", "Water m³/h", "D"],
        [["Feed ore", "52.5", "2.5", "0.05"],
         ["Rod mill discharge (pump)", "52.5", "39.9", "0.76"],
         ["Cyclone 2 feed", "83.7", "70.3", "0.84"],
         ["Cyclone 2 underflow", "31.2", "11.9", "0.38"],
         ["Cyclone 2 overflow", "52.5", "58.5", "1.11"],
         ["Cyclone 3 feed", "76.6", "79.7", "1.04"],
         ["Cyclone 3 underflow", "24.1", "13.7", "0.57"],
         ["To flotation", "52.5", "65.9", "1.26"]],
        [58 * mm, 32 * mm, 32 * mm, 26 * mm],
        bold_rows=(7,))

    # ------------------------------------------------------ 8 the workbook
    s.append(h1("8 · Driving the workbook"))
    s.append(p(
        "The assignment template (" + M("ProductWaterBalances-1.xlsx") + ") and the "
        "course's " + M("PRODUCT.XLS") + " are the same worksheet: one row per stream, "
        "one pair of columns per element (grade, then metal), and the closing rows at "
        "the bottom. Fill it in the order of sections 3 and 4, not left to right."))

    s += table(
        ["Column", "What goes in it", "How"],
        [["Product", "one row per stream that crosses the box",
          "feed first, then each concentrate, then the tail"],
         ["Dry weight", "the tonnage of the stream",
          "given for the feed; from recoveries or the two-product formula for the "
          "concentrates; the rest by difference"],
         ["Grade, per element", "% or g/t",
          "typed where the sheet gives it, computed by difference where it does not"],
         ["Metal, per element", "t or kg",
          "= dry weight × grade, with the unit conversion; this is the column that "
          "must add up"],
         ["Distribution %", "share of the feed metal in that stream",
          "= metal in the stream ÷ metal in the feed × 100; the column sums to 100"],
         ["Σ products", "sum of every stream except the feed",
          "compare it with the feed row: that comparison is the whole point"],
         ["Concentrator difference", "feed metal − Σ products metal",
          "zero by construction for the element that sized the streams"],
         ["Concentrator loss", "metal that missed its own concentrate, per t of feed",
          "state whether you counted the tail only or the tail plus the misplaced metal"]],
        [26 * mm, 52 * mm, 87 * mm], numeric=False)

    s.append(h2("Three habits that save the sheet"))
    s += bullets([
        B("Keep the units in one system.") + " Per cent next to per cent, g/t next to "
        "g/t. Mixing them is the single commonest way the metal column stops adding up, "
        "and in a least-squares balance it also wrecks the coefficients of A.",
        B("Never type a number the sheet can compute.") + " Every grade that came out "
        "by difference should be a formula pointing at the metal column, so that when "
        "you correct one assay the whole worksheet follows.",
        B("Put the check in a cell.") + " A cell holding Σ products − feed, for every "
        "element, next to a cell holding total water in − total water out. Watch those "
        "two cells while you work, not the pretty table.",
    ])

    # ------------------------------------------------------ 9 what goes wrong
    s.append(h1("9 · What goes wrong, and what it means"))

    s += table(
        ["Symptom", "What it is telling you"],
        [["A negative tonnage after balancing",
          "The equations are wrong, not the plant. Check which streams you declared "
          "internal and whether a node exists that you did not draw."],
         ["A stream balanced to zero flow",
          "Same cause. Usually a node connected to the wrong stream number."],
         ["An adjustment larger than three standard deviations",
          "Either the measurement is worse than you claimed, or the flowsheet is "
          "wrong: a stream forgotten, a node that does not exist."],
         ["The difference is large for one element only",
          "That element's assays do not hang together with the masses. Expected for "
          "gold at grams per tonne; suspicious for copper."],
         ["The answer swings when one assay moves slightly",
          "You balanced on an element with little contrast. Use the concentrate's own "
          "main metal, where c − t is large."],
         ["Weight % solids entered as a component",
          "It is not conserved on its own. Convert it to a water flow or a dilution "
          "ratio first, then let water be the component."],
         ["A relative standard deviation above 1.0",
          "The error is larger than the value: the measurement carries no information "
          "and the fit will move it anywhere. Good data sit at a few per cent."]],
        [52 * mm, 113 * mm], numeric=False)

    s += callout(
        "What weighting does and does not do",
        "Weights do not make the tonnages more accurate. They decide " + B("where the "
        "disagreement is dumped") + ": on the measurements you told the program to "
        "distrust. You cannot force a balance out of bad data; somewhere the error has "
        "to surface, sometimes as an absurd adjustment. The compendium's rule of thumb "
        "for relative standard deviations: measured mass flows 1 %; assays 1 % when "
        "very good, 10 % good, 30 % fair, 50 % bad, 100 % hopeless.")

    # ---------------------------------------------------- 10 the theory block
    s.append(h1("10 · The six statements (T9)"))
    s.append(p(
        "One exam question is six true-or-false statements about this material, one "
        "point each, and the point is only safe when you can say why."))

    s += table(
        ["Statement", "", "Why"],
        [["A node is a connection point in a flowsheet.", "True",
          "Any point where streams meet or split: a separator, a mixer, a machine. "
          "Balances are written around nodes."],
         ["A non-normal node can be found in a grinding circuit.", "True",
          "A mill has one feed and one discharge of the same composition, and a "
          "mill-plus-cyclone loop reduces to nodes with more than two products. Both "
          "are non-normal and typical of grinding."],
         ["Analyses of gold are uncertain.", "True",
          "Grades are grams per tonne and the grains are coarse and rare, so sampling "
          "and assay errors are large. Gold gets a big standard deviation or is left "
          "out of the fit."],
         ["It is best to use analyses with large contrast.", "True",
          "An element whose grade differs strongly between products pins the split. "
          "One with the same grade everywhere says nothing about the masses."],
         ["Weight % solids can be used directly in MATBAL.", "False",
          "It is not conserved on its own. Turn it into a water flow or a dilution "
          "ratio, or give solids and pulp masses separately."],
         ["A relative standard deviation above 1.0 is good.", "False",
          "The error exceeds the value, so the measurement carries no information. "
          "Good data are a few per cent."]],
        [60 * mm, 13 * mm, 92 * mm], numeric=False)

    # ------------------------------------------------------------- closing
    s.append(h1("Where this returns"))
    s += bullets([
        B("The assignment.") + " Product and water balances, due in Canvas; the "
        "exercise session walked the same sheet.",
        B("The computer lab.") + " The same arithmetic with more measurements than "
        "unknowns, solved by weighted least squares in HSC Sim; the report is graded "
        "inside examination module 0003.",
        B("The written exam.") + " T9 as the six statements, T10 and T11 at 10 points "
        "each. A full-mark answer has three parts: the box you chose with its streams "
        "named, the equations in symbols, and the numbers with units plus a check that "
        "closes.",
    ])
    return s


# --------------------------------------------------------------------------
# page furniture
# --------------------------------------------------------------------------
LEFT = 22 * mm
RIGHT = 23 * mm
TOP = 18 * mm
BOTTOM = 18 * mm
FRAME_W = A4[0] - LEFT - RIGHT


def _paper(canvas, doc):
    canvas.saveState()
    canvas.setFillColor(PAPER)
    canvas.rect(0, 0, A4[0], A4[1], stroke=0, fill=1)
    canvas.restoreState()


def _footer(canvas, doc):
    canvas.saveState()
    canvas.setFont(SANS, 7.4)
    canvas.setFillColor(MUTED)
    canvas.drawString(LEFT, BOTTOM - 7 * mm, COURSE)
    canvas.drawRightString(A4[0] - RIGHT, BOTTOM - 7 * mm, str(canvas.getPageNumber()))
    canvas.setStrokeColor(RULE)
    canvas.setLineWidth(0.4)
    canvas.line(LEFT, BOTTOM - 4.5 * mm, A4[0] - RIGHT, BOTTOM - 4.5 * mm)
    canvas.restoreState()


def on_first(canvas, doc):
    _paper(canvas, doc)
    y = A4[1] - TOP
    canvas.saveState()
    canvas.setFillColor(ACCENT)
    canvas.rect(LEFT, y - 3.2 * mm, 26 * mm, 1.6 * mm, stroke=0, fill=1)
    canvas.setFont(SANSB, 8.2)
    canvas.drawString(LEFT, y - 10 * mm, COURSE.upper())
    canvas.setFillColor(INK)
    canvas.setFont(SANSB, 24)
    canvas.drawString(LEFT, y - 22 * mm, TITLE)
    canvas.setFillColor(MUTED)
    canvas.setFont(SANS, 11)
    canvas.drawString(LEFT, y - 30 * mm, SUBTITLE)
    canvas.setStrokeColor(RULE)
    canvas.setLineWidth(0.5)
    canvas.line(LEFT, y - 35 * mm, A4[0] - RIGHT, y - 35 * mm)
    canvas.setFont(SANS, 7.6)
    canvas.setFillColor(MUTED)
    canvas.drawString(LEFT, y - 40 * mm,
                      "Assignment “Product and Water Balances”  ·  "
                      "circuit-balancing computer lab  ·  exam topics T9, T10, T11")
    canvas.restoreState()
    _footer(canvas, doc)


def on_later(canvas, doc):
    _paper(canvas, doc)
    canvas.saveState()
    canvas.setFont(SANS, 7.4)
    canvas.setFillColor(MUTED)
    canvas.drawString(LEFT, A4[1] - TOP + 2 * mm, TITLE + " — " + SUBTITLE)
    canvas.setStrokeColor(RULE)
    canvas.setLineWidth(0.4)
    canvas.line(LEFT, A4[1] - TOP - 0.5 * mm, A4[0] - RIGHT, A4[1] - TOP - 0.5 * mm)
    canvas.restoreState()
    _footer(canvas, doc)


def build(path):
    os.makedirs(os.path.dirname(path), exist_ok=True)
    doc = BaseDocTemplate(
        path, pagesize=A4,
        leftMargin=LEFT, rightMargin=RIGHT, topMargin=TOP, bottomMargin=BOTTOM,
        title="%s — %s" % (TITLE, SUBTITLE),
        author="Malla · M7003K",
        subject="Product balance, water balance, dilution ratio and circulating load",
        creator="apuntes/build.py")
    first = Frame(LEFT, BOTTOM, FRAME_W, A4[1] - TOP - BOTTOM - 46 * mm, id="first",
                  leftPadding=0, rightPadding=0, topPadding=0, bottomPadding=0)
    later = Frame(LEFT, BOTTOM, FRAME_W, A4[1] - TOP - BOTTOM - 4 * mm, id="later",
                  leftPadding=0, rightPadding=0, topPadding=0, bottomPadding=0)
    doc.addPageTemplates([
        PageTemplate(id="first", frames=[first], onPage=on_first),
        PageTemplate(id="later", frames=[later], onPage=on_later),
    ])
    flowables = [NextPageTemplate("later")] + story()
    doc.build(flowables)
    return path


if __name__ == "__main__":
    here = os.path.dirname(os.path.abspath(__file__))
    root = os.path.abspath(os.path.join(here, os.pardir, os.pardir))
    out = os.path.join(root, "M7003K", "notes", "01_nodes_and_streams.pdf")
    build(out)
    print("wrote %s (%.1f kB)" % (out, os.path.getsize(out) / 1024.0))
