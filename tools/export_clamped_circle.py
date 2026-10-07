"""Clamped Kirchhoff circular plate: J_m(a) I_(m+1)(a)+J_(m+1)(a) I_m(a)=0.
Compact radial profiles avoid shipping another large sampled-grid binary.
"""
import json
from pathlib import Path
import numpy as np
from scipy.special import jv, iv
from scipy.optimize import brentq


def generate():
    profiles=[]
    scale=22.0  # radius=side/2, same material/thickness as the square
    r=np.linspace(0,1,513)
    residuals=[]
    for m in range(20):
        def equation(a): return jv(m,a)*iv(m+1,a)+jv(m+1,a)*iv(m,a)
        xs=np.arange(max(.1,m),np.sqrt(7500/scale)+.1,.08)
        roots=[]
        for lo,hi in zip(xs[:-1],xs[1:]):
            if equation(lo)*equation(hi)<0: roots.append(brentq(equation,lo,hi,xtol=1e-13))
        for order,a in enumerate(roots,1):
            frequency=scale*a*a
            if frequency>7500:continue
            ratio=jv(m,a)/iv(m,a)
            radial=jv(m,a*r)-ratio*iv(m,a*r)
            radial/=np.max(np.abs(radial))
            residuals.append(abs(equation(a))/iv(m,a))
            profiles.append({'m':m,'n':order,'root':a,'frequency':frequency,'radial':np.round(radial,8).tolist()})
    profiles.sort(key=lambda x:x['frequency'])
    assert abs(profiles[0]['root']**2-10.215826)<1e-5
    assert max(residuals)<1e-10
    Path('data/clamped-circle.json').write_text(json.dumps({'boundary':'clamped','profiles':profiles},separators=(',',':'))+'\n')
    print('Clamped circle:',len(profiles),'radial profiles; maximum boundary residual',max(residuals))
if __name__=='__main__':generate()
