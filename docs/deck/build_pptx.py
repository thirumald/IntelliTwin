"""Build IntelliTwin-Stakeholder-Deck.pptx from the slide sources in this folder.

Usage: python docs/deck/build_pptx.py
Requires: python-pptx. The PPTX is a simplified rendering of the web deck
(same text, screenshots and speaker notes; simpler styling).
"""
import json, re
from html.parser import HTMLParser
from pathlib import Path
from pptx import Presentation
from pptx.util import Inches, Pt
from pptx.dml.color import RGBColor

HERE = Path(__file__).parent
IMG = {"map": ["map.jpg"], "congestion": ["congestion.jpg"], "incident": ["incident.jpg"],
       "violation": ["violation.jpg"], "dashboards": ["overview.jpg", "enforcement.jpg"],
       "forecast": ["overview.jpg"], "cities": ["riyadh.jpg"], "brand": ["brand.jpg"],
       "cover": ["presight-logo.png"]}
NAVY, LIGHT, ACC, TXT = RGBColor(0x0A,0x14,0x24), RGBColor(0xEE,0xF3,0xF9), RGBColor(0x3B,0xB8,0xFF), RGBColor(0xE8,0xEE,0xF6)

class P(HTMLParser):
    def __init__(s):
        super().__init__(); s.items=[]; s.cur=None; s.notes=""; s.skip=0; s.light=False
    def handle_starttag(s, t, a):
        a=dict(a)
        if t=="section" and "light" in a.get("class",""): s.light=True
        if t=="div" and a.get("class")=="foot": s.skip=1
        if t=="aside": s.cur="aside"
        elif s.skip==0 and t in("h1","h2","h3","p","li"): s.cur=(t,a.get("class",""))
    def handle_endtag(s, t):
        if t=="aside" or (s.cur and s.cur!="aside" and s.cur[0]==t): s.cur=None
        if t=="div" and s.skip: s.skip=0
    def handle_data(s, d):
        if not s.cur or not d.strip(): return
        if s.cur=="aside": s.notes+=d
        else: s.items.append((s.cur[0], s.cur[1], d.strip()))

def tb(slide, x,y,w,h):
    t=slide.shapes.add_textbox(Inches(x),Inches(y),Inches(w),Inches(h)); t.text_frame.word_wrap=True; return t.text_frame

def main():
    order=json.loads((HERE/"deck.json").read_text())["order"]
    prs=Presentation(); prs.slide_width=Inches(13.333); prs.slide_height=Inches(7.5)
    for sid in order:
        p=P(); p.feed((HERE/"slides"/f"{sid}.html").read_text())
        s=prs.slides.add_slide(prs.slide_layouts[6])
        bg=s.background.fill; bg.solid(); bg.fore_color.rgb = LIGHT if p.light else NAVY
        ink = RGBColor(0x14,0x22,0x38) if p.light else TXT
        imgs=IMG.get(sid,[]); has_img=bool(imgs) and sid!="cover"
        w=6.2 if has_img else 11.8
        tf=tb(s,0.7,0.6,w,6.3); first=True
        for kind,cls,txt in p.items:
            para=tf.paragraphs[0] if first else tf.add_paragraph(); first=False
            r=para.add_run(); r.text=txt.upper() if cls=="eyebrow" else txt
            size={"h1":54,"h2":34,"h3":22}.get(kind,16)
            if cls=="eyebrow": size=13
            r.font.size=Pt(size); r.font.bold = kind in("h1","h2","h3") or cls=="eyebrow"
            r.font.color.rgb = ACC if cls=="eyebrow" else ink
            para.space_after=Pt(10)
        if sid=="cover": s.shapes.add_picture(str(HERE/"img"/imgs[0]),Inches(0.7),Inches(0.4),height=Inches(0.8))
        elif len(imgs)==1: s.shapes.add_picture(str(HERE/"img"/imgs[0]),Inches(7.1),Inches(1.3),width=Inches(5.8))
        elif imgs:
            for i,f in enumerate(imgs): s.shapes.add_picture(str(HERE/"img"/f),Inches(0.7+i*6.1),Inches(4.0),width=Inches(5.9))
        if p.notes.strip(): s.notes_slide.notes_text_frame.text=p.notes.strip()
    out=HERE/"IntelliTwin-Stakeholder-Deck.pptx"; prs.save(out); print("wrote",out)
main()
