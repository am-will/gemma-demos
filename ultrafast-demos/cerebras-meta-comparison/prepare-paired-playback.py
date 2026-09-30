"""Lock both recorded responses to one 30 fps video clock; source timings stay intact."""
from pathlib import Path
import subprocess
ROOT=Path(__file__).resolve().parent
ASSETS=ROOT/'assets'
# Meta changes to its submitted screen at frame 255; Cerebras at frame 256.
# Drop Cerebras' single idle frame so both visible submitted states begin together.
# Reported elapsed values still refer to the original click-to-completion measurement.
# Meta's final 200ms before completion plays at 1x; all other response timing is unchanged.
filters=';'.join([
 '[0:v]trim=start_frame=256:end=32.9,setpts=PTS-STARTPTS,fps=30,tpad=stop_mode=clone:stop_duration=18,trim=duration=42.25,scale=884:946,setsar=1[c]',
 '[1:v]split=3[m0][m1][m2]',
 '[m0]trim=start=8.5:end=28.066667,setpts=PTS-STARTPTS,fps=30[mnormal]',
 '[m1]trim=start=28.066667:end=109.733333,setpts=(PTS-STARTPTS)/6,fps=30[mfast]',
 '[m2]trim=start=109.733333:end=116.566666,setpts=PTS-STARTPTS,fps=30[mresult]',
 '[mnormal][mfast][mresult]concat=n=3:v=1:a=0,tpad=stop_mode=clone:stop_duration=3,trim=duration=42.25,scale=896:952,crop=890:946:3:3,setsar=1[m]',
 'color=c=0xfdfdfd:s=1920x946:r=30:d=42.25[bg]',
 '[bg][c]overlay=x=48:y=0:shortest=1[half]',
 '[half][m]overlay=x=986:y=0:shortest=1,format=yuv420p[paired]',
 # Remove composition 45–49s (paired track 35–39s) from the completed hold.
 '[paired]split=2[before][after]',
 '[before]trim=end=35,setpts=PTS-STARTPTS[head]',
 '[after]trim=start=39,setpts=PTS-STARTPTS[tail]',
 '[head][tail]concat=n=2:v=1:a=0[out]',
])
subprocess.run(['ffmpeg','-y','-hide_banner','-loglevel','error','-i',str(ASSETS/'cerebras.mp4'),'-i',str(ASSETS/'meta-221911.mp4'),'-filter_complex',filters,'-map','[out]','-an','-c:v','libx264','-preset','fast','-crf','16','-g','30','-keyint_min','30','-movflags','+faststart',str(ASSETS/'paired-responses-short-hold.mp4')],check=True)
for name in ['cerebras','meta-221911']:
 subprocess.run(['ffmpeg','-y','-loglevel','error','-ss','8.2','-i',str(ASSETS/(name+'.mp4')),'-frames:v','1',str(ASSETS/(name+'-start.png'))],check=True)
print('Paired responses share one 30fps clock, starting at composition 10.0s; four seconds removed from the completed hold.')
