import glob, os
import onnx, torch, coremltools as ct
from onnx2torch import convert

def input_shape(path):
    vi = onnx.load(path).graph.input[0]
    dims = [d.dim_value or 1 for d in vi.type.tensor_type.shape.dim]  # dynamic -> 1
    return vi.name, tuple(dims)

for path in glob.glob("models/*.onnx"):
    print("converting:", path)
    try:
        name, shape = input_shape(path)
        m = convert(path).eval()
        example = torch.rand(*shape)
        traced = torch.jit.trace(m, example, strict=False)

        mlmodel = ct.convert(
            traced,
            inputs=[ct.TensorType(name=name, shape=shape)],
            minimum_deployment_target=ct.target.iOS17,
            compute_precision=ct.precision.FLOAT16,
        )
        out = os.path.splitext(path)[0] + ".mlpackage"
        mlmodel.save(out)
        print("  ->", out)
    except Exception as e:
        print("  FAILED:", type(e).__name__, e)
