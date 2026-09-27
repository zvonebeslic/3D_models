import torch
from logoedge_model import LogoEdgeNet
m=LogoEdgeNet(); m.load_state_dict(torch.load('logoedge.pt',map_location='cpu')); m.eval()
x=torch.randn(1,3,256,256)
torch.onnx.export(m,x,'logoedge.onnx',input_names=['image'],output_names=['mask','edge'],opset_version=17)
print('wrote logoedge.onnx')
