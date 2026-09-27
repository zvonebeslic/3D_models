"""LogoEdge AI: small segmentation network designed from scratch for logo masks."""
import torch
import torch.nn as nn

class Block(nn.Module):
    def __init__(self, cin, cout):
        super().__init__()
        self.net=nn.Sequential(nn.Conv2d(cin,cout,3,1,1,bias=False),nn.BatchNorm2d(cout),nn.SiLU(),nn.Conv2d(cout,cout,3,1,1,bias=False),nn.BatchNorm2d(cout),nn.SiLU())
    def forward(self,x): return self.net(x)

class LogoEdgeNet(nn.Module):
    def __init__(self):
        super().__init__()
        self.e1=Block(3,24); self.e2=Block(24,48); self.e3=Block(48,96); self.mid=Block(96,160)
        self.pool=nn.MaxPool2d(2)
        self.u3=nn.ConvTranspose2d(160,96,2,2); self.d3=Block(192,96)
        self.u2=nn.ConvTranspose2d(96,48,2,2); self.d2=Block(96,48)
        self.u1=nn.ConvTranspose2d(48,24,2,2); self.d1=Block(48,24)
        self.mask=nn.Conv2d(24,1,1)
        self.edge=nn.Conv2d(24,1,1)
    def forward(self,x):
        a=self.e1(x); b=self.e2(self.pool(a)); c=self.e3(self.pool(b)); m=self.mid(self.pool(c))
        x=self.d3(torch.cat([self.u3(m),c],1)); x=self.d2(torch.cat([self.u2(x),b],1)); x=self.d1(torch.cat([self.u1(x),a],1))
        return self.mask(x),self.edge(x)
