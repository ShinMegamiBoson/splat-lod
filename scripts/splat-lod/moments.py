import numpy as np
from scipy.spatial.transform import Rotation

def moment_parent(position,covariance,scale,opacity,sh):
    """Optical-depth/surface-area moments, then a native PLY parameter row."""
    area=lambda s:(((s[...,0]*s[...,1])**1.6075+(s[...,0]*s[...,2])**1.6075+(s[...,1]*s[...,2])**1.6075)/3)**(1/1.6075)
    mass=-np.log1p(-np.minimum(opacity,.999999))*area(scale)
    total=mass.sum(1);weights=mass/np.maximum(total[:,None],1e-20)
    empty=total<=1e-20;weights[empty]=1/position.shape[1]
    center=np.einsum('bn,bni->bi',weights,position)
    delta=position-center[:,None]
    cov=np.einsum('bn,bnij->bij',weights,covariance+delta[:,:,:,None]*delta[:,:,None,:])
    values,vectors=np.linalg.eigh(cov);values=np.maximum(values,1e-16)
    vectors[:,:,-1]*=np.where(np.linalg.det(vectors)<0,-1,1)[:,None]
    scales=np.sqrt(values);quat=Rotation.from_matrix(vectors).as_quat()
    alpha=np.clip(-np.expm1(-total/np.maximum(area(scales),1e-20)),1e-6,1-1e-6)
    coefficients=np.einsum('bn,bnsc->bsc',weights,sh)
    rows=np.empty((len(center),59),np.float32);rows[:,:3]=center;rows[:,3:6]=coefficients[:,0]
    rows[:,6:51]=coefficients[:,1:].transpose(0,2,1).reshape(-1,45)
    rows[:,51]=np.log(alpha/(1-alpha));rows[:,52:55]=np.log(scales);rows[:,55:59]=quat[:,[3,0,1,2]]
    return rows

def rotation(q):
    x,y,z,w=np.moveaxis(q,-1,0)
    return np.stack([1-2*(y*y+z*z),2*(x*y-z*w),2*(x*z+y*w),2*(x*y+z*w),1-2*(x*x+z*z),2*(y*z-x*w),2*(x*z-y*w),2*(y*z+x*w),1-2*(x*x+y*y)],-1).reshape(*q.shape[:-1],3,3)
