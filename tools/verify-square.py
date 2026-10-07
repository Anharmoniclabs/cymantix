"""Check the shipped square spectrum against a larger Ritz basis."""
import importlib.util, struct
import numpy as np
spec=importlib.util.spec_from_file_location('reference','tools/square-reference.py')
reference=importlib.util.module_from_spec(spec);spec.loader.exec_module(reference)
with open('data/modes_square.bin','rb') as f:
    n,grid=struct.unpack('<II',f.read(8));stored=np.frombuffer(f.read(4*n),dtype='<f4').copy()
values,_=reference.free_square_modes(30)
frequencies=values*reference.FS
frequencies=frequencies[(frequencies>=45)&(frequencies<=7500)]
error=np.abs(stored-frequencies[:n])/frequencies[:n]
assert error.max()<.01
print({'modes':n,'larger_basis_max_relative_frequency_change':float(error.max()),'first_frequency_hz':float(stored[0]),'status':'PASS'})
