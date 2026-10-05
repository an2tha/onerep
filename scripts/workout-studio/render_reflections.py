"""Render the authored room's actual reflections for the WebGL PBR materials."""
import bpy,os,math
ROOT=os.path.abspath(os.path.join(os.path.dirname(__file__),'../..'))
bpy.ops.wm.open_mainfile(filepath=os.path.join(ROOT,'scripts/workout-studio/studio.blend'))
scene=bpy.context.scene
bpy.ops.object.camera_add(location=(.4,2.0,1.6));camera=bpy.context.object
camera.data.type='PANO';camera.data.panorama_type='EQUIRECTANGULAR';camera.rotation_euler=(math.pi/2,0,0)
scene.camera=camera;scene.render.resolution_x=1024;scene.render.resolution_y=512;scene.cycles.samples=32
scene.render.image_settings.file_format='HDR';scene.render.filepath=os.path.join(ROOT,'apps/mobile/public/workout-studio/studio-reflections.hdr')
bpy.ops.render.render(write_still=True)
