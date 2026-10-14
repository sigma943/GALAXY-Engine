export const starVertex=`#version 300 es
precision highp float;
in vec2 aPosition;
in vec2 aUV;
in vec3 aData;
in vec3 aColor;
uniform vec2 uResolution;
uniform vec4 uView;
out vec2 vUV;
out vec3 vData;
out vec3 vColor;
void main(){
 vec2 px=uView.xy+aPosition*uView.zw+(aUV-.5)*aData.x*14.0;
 gl_Position=vec4(px.x/uResolution.x*2.0-1.0,1.0-px.y/uResolution.y*2.0,0,1);
 vUV=aUV;vData=aData;vColor=aColor;
}`;
export const starFragment=`#version 300 es
precision highp float;
in vec2 vUV;in vec3 vData;in vec3 vColor;
uniform float uTime;uniform float uGlow;uniform float uTwinkle;uniform float uAlpha;
out vec4 finalColor;
void main(){
 vec2 p=(vUV-.5)*14.0;
 float r=length(p);
 float core=exp(-r*r*2.3);
 float halo=exp(-r*r*.19)*.10*uGlow;
 float cross=exp(-abs(p.x)*7.0-abs(p.y)*.9)+exp(-abs(p.y)*7.0-abs(p.x)*.9);
 float spike=vData.x>1.4?cross*.10:0.0;
 float flicker=1.0+sin(uTime*.7+vData.z)*.08*uTwinkle;
 float alpha=clamp((core+halo+spike)*vData.y*flicker,0.0,1.0)*uAlpha;
 finalColor=vec4(vColor*alpha,alpha);
}`;
export const meteorVertex=`#version 300 es
precision highp float;
in vec2 aPosition;in vec2 aUV;
uniform vec2 uResolution;uniform vec2 uHead;uniform vec2 uDirection;uniform float uLength;
out vec2 vUV;
void main(){vec2 normal=vec2(-uDirection.y,uDirection.x);
 vec2 px=uHead-uDirection*aUV.x*uLength+normal*(aUV.y-.5)*14.0;
 gl_Position=vec4(px.x/uResolution.x*2.0-1.0,1.0-px.y/uResolution.y*2.0,0,1);vUV=aUV;}`;
export const meteorFragment=`#version 300 es
precision highp float;
in vec2 vUV;uniform float uOpacity;out vec4 finalColor;
void main(){float d=abs(vUV.y-.5)*14.0;
 float taper=pow(1.0-vUV.x,2.0);
 float tail=(exp(-d*d*3.0)+exp(-d*d*.16)*.16)*taper;
 float head=exp(-vUV.x*vUV.x*1100.0-d*d*.45)*.7;
 float a=clamp((tail+head)*uOpacity,0.0,1.0);finalColor=vec4(vec3(.76,.88,1.0)*a,a);}`;
