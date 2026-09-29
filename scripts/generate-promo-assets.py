#!/usr/bin/env python3
"""Regenerate social cards from existing approved art. Requires Pillow and Noto CJK."""
from pathlib import Path
from PIL import Image, ImageDraw, ImageFont
root=Path(__file__).resolve().parents[1]
image=Image.open(root/'public/mir-profile-live.gif')
image.seek(0)
image.convert('RGBA').save(root/'public/mir-profile-still.webp','WEBP',quality=88)
# Social cards use existing owner-provided character art; no new artist likeness.
font='/usr/share/fonts/opentype/noto/NotoSansCJK-Bold.ttc'
regular='/usr/share/fonts/opentype/noto/NotoSansCJK-Regular.ttc'
def f(n,b=True):return ImageFont.truetype(font if b else regular,n,index=1)
for name in ['home','blued']:
    im=Image.new('RGB',(1200,630)); pix=im.load()
    for y in range(630):
        for x in range(1200):
            glow=max(0,1-((x-1040)**2+(y-250)**2)**.5/850)
            pix[x,y]=(int(7+6*glow),int(16+28*glow),int(34+69*glow))
    d=ImageDraw.Draw(im)
    d.line((64,68,1136,68),fill=(72,108,158),width=1)
    d.text((64,90),'MIR × CHEONGWOON BAND',font=f(22),fill=(148,192,239))
    if name=='home':
        d.text((60,185),'목소리와 연주가 만나',font=f(43),fill=(245,250,255))
        d.text((60,253),'하나의 무대가 되는 순간',font=f(43),fill=(138,203,255))
        d.text((64,350),'미르 × 청운밴드',font=f(31),fill=(245,250,255))
        d.text((64,404),'라이브 · 공연 · 팬 아카이브',font=f(21,False),fill=(182,204,227))
        art=Image.open(root/'public/mir-profile-still.webp').convert('RGBA');art.thumbnail((430,465));im.paste(art,(752,115),art)
    else:
        d.text((58,155),'BLUED',font=f(112),fill=(206,232,255))
        d.text((64,301),'MIR THE 1ST OFFLINE CONCERT',font=f(23),fill=(148,192,239))
        d.text((64,370),'미르와 청운밴드가 함께한 무대',font=f(33),fill=(245,250,255))
        d.text((64,441),'2025.08.09  /  서울 마곡 NSP홀',font=f(25,False),fill=(182,204,227))
        d.rounded_rectangle((885,159,1118,483),radius=22,outline=(95,151,221),width=2)
        d.text((921,187),'08',font=f(89),fill=(240,248,255));d.text((921,299),'09',font=f(89),fill=(134,194,255))
    d.text((64,551),'UNOFFICIAL FAN ARCHIVE',font=f(18),fill=(126,162,201))
    d.text((908,551),'mir.yeop.net',font=f(21,False),fill=(148,192,239))
    (root/'public/og').mkdir(exist_ok=True)
    im.save(root/f'public/og/{name}.png',optimize=True)
print('Generated derived artwork from existing site assets.')
