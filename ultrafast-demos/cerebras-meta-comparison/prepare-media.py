"""Prepare local footage; response playback stays exactly 1x; originals untouched.
Submit/end markers are sampled at 30fps from visible submit and Stop -> Send.
"""
from pathlib import Path
import subprocess
import json
import sys
ROOT = Path(__file__).resolve().parent
ASSETS = ROOT / 'assets'
ASSETS.mkdir(exist_ok=True)
SUBMISSION, TYPING_START, TYPING_END = 8.5, 1.5, 7.0
# Prepared media offsets stay fixed; the native intro holds 1.5s longer.
COMPOSITION_SUBMISSION = 10.0
SOURCES = [
 dict(id='cerebras',file='CleanShot 2026-09-24 at 9.38.33 PM.mp4',submit=28.066666667,complete=47.633333333,end=52.476667),
 dict(id='meta',file='CleanShot 2026-09-24 at 10.19.11 PM.mp4',submit=27.266666667,complete=128.7,end=135.346667),
]
def run(*args):
 subprocess.run(['ffmpeg','-hide_banner','-loglevel','error','-y',*map(str,args)],check=True)
for s in SOURCES:
 source=Path.home()/'Desktop'/s['file']
 asset=s['id'] if s['id']=='cerebras' else 'meta-221911'
 typing_end=s['submit']-1/30
 filters=(f'[0:v]split=2[a][b];'
  f'[a]trim=start=0:end={typing_end},setpts=(PTS-STARTPTS)*{(TYPING_END-TYPING_START)/typing_end},fps=30,'
  f'tpad=start_mode=clone:start_duration={TYPING_START}:stop_mode=clone:stop_duration={SUBMISSION-TYPING_END},trim=duration={SUBMISSION}[pre];'
  f'[b]trim=start={s["submit"]},setpts=PTS-STARTPTS,fps=30[run];'
  '[pre][run]concat=n=2:v=1:a=0,setsar=1[v]')
 run('-i',source,'-filter_complex',filters,'-map','[v]','-an','-c:v','libx264','-preset','fast','-crf','16','-g','30','-keyint_min','30','-pix_fmt','yuv420p','-movflags','+faststart',ASSETS/f'{asset}.mp4')
 run('-ss',s['end']-0.15,'-i',source,'-frames:v','1',ASSETS/f'{asset}-hold.png')
 s['elapsed']=round(s['complete']-s['submit'],6)
 s['timelineComplete']=COMPOSITION_SUBMISSION+s['elapsed']
 s['timelineEnd']=COMPOSITION_SUBMISSION+s['end']-s['submit']
DONE_SETTLE=0.2
FAST_END=COMPOSITION_SUBMISSION+SOURCES[0]['elapsed']+(SOURCES[1]['elapsed']-DONE_SETTLE-SOURCES[0]['elapsed'])/6
SOURCES[1]['timelineComplete']=FAST_END+DONE_SETTLE
SOURCES[1]['timelineEnd']=SOURCES[1]['timelineComplete']+SOURCES[1]['end']-SOURCES[1]['complete']-4
(ROOT/'timing.json').write_text(json.dumps(dict(submission=COMPOSITION_SUBMISSION,typingStart=TYPING_START,typingEnd=TYPING_END,duration=58.5,comparisonDuration=47.5,bumper=dict(start=47.5,duration=11.0,multiplier=25),speedup=dict(lane="meta",factor=6,start=COMPOSITION_SUBMISSION+SOURCES[0]["elapsed"],end=FAST_END,settleBeforeDone=DONE_SETTLE),sources=SOURCES,playback=dict(asset="paired-responses-short-hold.mp4",start=COMPOSITION_SUBMISSION,fps=30,sharedClock=True,sourceStartFrames=dict(cerebras=256,meta=255))),indent=2)+'\n')
print('Prepared both recordings; response sections remain 1x.',flush=True)

subprocess.run([sys.executable, str(ROOT / "prepare-paired-playback.py")], check=True)
