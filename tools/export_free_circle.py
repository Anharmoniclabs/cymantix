"""Free-edge Kirchhoff circular plate, Poisson ratio 0.3.

For W=R(r) cos(m theta), R=A J_m(a r)+B I_m(a r), at r=1:
  M = R'' + nu (R' - m^2 R) = 0
  V = R''' + R'' - [1+(2-nu)m^2]R' + (3-nu)m^2 R = 0.
These are zero radial bending moment and effective Kirchhoff shear, not W=0.
Rigid translation/tilt are excluded from this flexural model.
Reference boundary conditions: https://wvtps-iitd.vlabs.ac.in/exp/circular-plate/theory.html
"""
import json
from pathlib import Path
import numpy as np
from scipy.special import jv, iv, jvp, ivp
from scipy.optimize import brentq

NU = .3
SCALE = 22.0


def boundary(m, a, modified=False):
    function, derivative = (iv, ivp) if modified else (jv, jvp)
    value, slope = function(m, a), a * derivative(m, a)
    curvature = a*a*derivative(m, a, 2)
    moment = curvature + NU*(slope-m*m*value)
    # d_r Laplacian R = +/- a^2 R', from the Bessel equation.
    shear = (1 if modified else -1)*a*a*slope-(1-NU)*m*m*(slope-value)
    return np.array([moment, shear])


def generate():
    profiles=[]
    radius=np.linspace(0,1,513)
    residuals=[]
    for m in range(24):
        def determinant(a):
            j=boundary(m,a); i=boundary(m,a,True)
            return (j[0]*i[1]-i[0]*j[1])/(np.linalg.norm(j)*np.linalg.norm(i))
        samples=np.arange(max(.4,m*.7),np.sqrt(7500/SCALE)+.06,.025)
        roots=[]
        for left,right in zip(samples[:-1],samples[1:]):
            if determinant(left)*determinant(right)<0:
                roots.append(brentq(determinant,left,right,xtol=1e-13))
        for order,a in enumerate(roots,1):
            if SCALE*a*a>7500:continue
            j,i=boundary(m,a),boundary(m,a,True)
            coefficient=-float(np.dot(j,i)/np.dot(i,i))
            radial=jv(m,a*radius)+coefficient*iv(m,a*radius)
            maximum=float(np.max(np.abs(radial)))
            radial/=maximum
            residual=float(np.linalg.norm(j+coefficient*i)/(np.linalg.norm(j)+abs(coefficient)*np.linalg.norm(i)))
            residuals.append(residual)
            profiles.append(dict(m=m,n=order,root=a,frequency=SCALE*a*a,coefficient=coefficient,normalization=maximum,radial=np.round(radial*32767).astype(int).tolist()))
    profiles.sort(key=lambda p:p['frequency'])
    expected={0:9.0031,1:20.4746,2:5.3583,3:12.439}
    for m,value in expected.items():
        first=next(p for p in profiles if p['m']==m)
        assert abs(first['root']**2-value)<.002,(m,first['root']**2)
    assert max(residuals)<1e-10
    assert all(abs(p['radial'][-1])/32767>.01 for p in profiles), 'Free rim must not be a universal zero'
    result={'boundary':'free','poisson':NU,'frequencyScaleHz':SCALE,'radialScale':1/32767,'profiles':profiles}
    Path('data/free-circle.json').write_text(json.dumps(result,separators=(',',':'))+'\n')
    print(json.dumps({'profiles':len(profiles),'fundamentalHz':profiles[0]['frequency'],'maximumBoundaryResidual':max(residuals),'firstParameters':{m:next(p['root']**2 for p in profiles if p['m']==m) for m in expected}},indent=2))

if __name__=='__main__':generate()
