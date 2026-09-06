"""A regular volume grid, without connected-component or per-splat LOD cuts."""
import numpy as np

def cube_partition(position,cell_size):
    if not np.isfinite(cell_size) or cell_size<=0:raise ValueError('Invalid cube size')
    if position.ndim!=2 or position.shape[1]!=3 or not len(position) or not np.isfinite(position).all():raise ValueError('Invalid positions')
    coordinate=np.floor(position.astype(np.float64)/cell_size)
    if np.abs(coordinate).max()>np.iinfo(np.int32).max:raise ValueError('Cube coordinates exceed int32')
    cubes,owner=np.unique(coordinate.astype(np.int32),axis=0,return_inverse=True)
    order=np.argsort(owner,kind='stable').astype(np.uint32)
    offsets=np.r_[0,np.cumsum(np.bincount(owner,minlength=len(cubes)))].astype(np.uint32)
    bounds=np.empty((len(cubes),4),np.float32);bounds[:,:3]=(cubes.astype(np.float64)+.5)*cell_size;bounds[:,3]=cell_size*np.sqrt(3)/2
    return {'coordinates':cubes,'owner':owner.astype(np.uint32),'order':order,'offsets':offsets,'bounds':bounds}

def cube_draw_bounds(position,support,partition):
    b=partition['bounds'].copy();owner=partition['owner'];order=partition['order'];offsets=partition['offsets']
    distances=np.linalg.norm(position-b[owner,:3],axis=1)+support
    b[:,3]=np.maximum(b[:,3],np.maximum.reduceat(distances[order],offsets[:-1]))
    return b

def cube_groups(offsets,span):
    if not isinstance(span,int) or span<2:raise ValueError('Invalid merge span')
    counts=np.diff(offsets).astype(np.int64);sizes=np.where(counts>1,(counts+span-1)//span,0)
    out=np.r_[0,np.cumsum(sizes)].astype(np.uint32);owner=np.repeat(np.arange(len(counts),dtype=np.uint32),sizes)
    local=np.arange(len(owner))-np.repeat(out[:-1],sizes)
    starts=(offsets[owner]+local*span).astype(np.uint32)
    return {'offsets':out,'owner':owner,'starts':starts,'sizes':np.minimum(span,offsets[owner+1]-starts).astype(np.uint32)}

def order_within_regions(position,order,offsets,leaf_size=8):
    """Position-only KD ordering is a merge heuristic INSIDE each owned region."""
    order=order.copy()
    stack=[(int(offsets[i]),int(offsets[i+1])) for i in range(len(offsets)-1)]
    while stack:
        begin,end=stack.pop();n=end-begin
        if n<=leaf_size:continue
        ids=order[begin:end];xyz=position[ids];axis=int(np.argmax(np.ptp(xyz,axis=0)))
        middle=(int(np.ceil(n/leaf_size))//2)*leaf_size
        partition=np.argpartition(xyz[:,axis],middle)
        order[begin:end]=ids[partition]
        stack.extend([(begin,begin+middle),(begin+middle,end)])
    return order
