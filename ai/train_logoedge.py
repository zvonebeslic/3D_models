import random, math, os
import numpy as np
from PIL import Image,ImageDraw,ImageFilter
import torch
import torch.nn.functional as F
from torch.utils.data import Dataset,DataLoader
from logoedge_model import LogoEdgeNet

S=256
class SyntheticLogos(Dataset):
    def __len__(self): return 100000
    def __getitem__(self,idx):
        mask=Image.new('L',(S,S),0); d=ImageDraw.Draw(mask)
        for _ in range(random.randint(1,7)):
            x1=random.randint(18,170); y1=random.randint(18,170); x2=random.randint(x1+15,238); y2=random.randint(y1+15,238)
            if random.random()<.5:d.ellipse((x1,y1,x2,y2),fill=255)
            else:d.rounded_rectangle((x1,y1,x2,y2),radius=random.randint(0,30),fill=255)
        # occasional holes teach internal contours
        if random.random()<.55:
            x=random.randint(55,150); y=random.randint(55,150); r=random.randint(7,35); d.ellipse((x,y,x+r,y+r),fill=0)
        fg=np.array([random.randint(0,255) for _ in range(3)],np.uint8); bg=np.array([random.randint(0,255) for _ in range(3)],np.uint8)
        m=np.asarray(mask,dtype=np.float32)/255.; arr=bg[None,None,:]*(1-m[:,:,None])+fg[None,None,:]*m[:,:,None]
        im=Image.fromarray(arr.astype(np.uint8)).resize((random.randint(90,230),random.randint(90,230))).resize((S,S)).filter(ImageFilter.GaussianBlur(random.random()*1.6))
        a=np.asarray(im,dtype=np.float32)/255.; a=np.clip(a+np.random.normal(0,random.random()*.035,a.shape),0,1)
        mt=torch.from_numpy(m).float()[None]
        # differentiable target edge from mask morphology
        dil=F.max_pool2d(mt[None],3,1,1)[0]; ero=-F.max_pool2d((-mt)[None],3,1,1)[0]; edge=(dil-ero).clamp(0,1)
        return torch.from_numpy(a.transpose(2,0,1)).float(),mt,edge

def loss_fn(pm,pe,m,e):
    bce=F.binary_cross_entropy_with_logits(pm,m); edge=F.binary_cross_entropy_with_logits(pe,e)
    p=torch.sigmoid(pm); dice=1-(2*(p*m).sum((1,2,3))+1)/((p+m).sum((1,2,3))+1)
    return bce+dice.mean()+.65*edge

def main():
    device='cuda' if torch.cuda.is_available() else 'cpu'; print('device:',device)
    model=LogoEdgeNet().to(device); opt=torch.optim.AdamW(model.parameters(),lr=2e-3,weight_decay=1e-4)
    dl=DataLoader(SyntheticLogos(),batch_size=32,shuffle=True,num_workers=2,pin_memory=True)
    model.train()
    for step,(x,m,e) in enumerate(dl,1):
        x,m,e=x.to(device),m.to(device),e.to(device); opt.zero_grad(set_to_none=True); pm,pe=model(x); loss=loss_fn(pm,pe,m,e); loss.backward(); opt.step()
        if step%100==0: print(step,float(loss))
        if step%1000==0: torch.save(model.state_dict(),'logoedge.pt')
        if step>=12000: break
    torch.save(model.state_dict(),'logoedge.pt')
    dummy=torch.randn(1,3,S,S,device=device)
    torch.onnx.export(model,dummy,'logoedge.onnx',input_names=['image'],output_names=['mask','edge'],dynamic_axes={'image':{0:'batch'},'mask':{0:'batch'},'edge':{0:'batch'}},opset_version=17)
if __name__=='__main__': main()
