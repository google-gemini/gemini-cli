#!/bin/bash
# =============================================
#  AstraAI Pro Ops Suite  — Full Auto Setup
# =============================================
# Works on Linux, macOS, or Windows (WSL / Git Bash)

echo "🔧 Building complete AstraAI Project…"
mkdir -p AstraAI_Project/{app/modules,configs,docs,logs/{development,ai_testing,production},datasource}
cd AstraAI_Project || exit 1

# -------------------- APP: main.py --------------------
cat > app/main.py <<'EOF'
import os, re, csv, json, smtplib, logging, sqlite3, requests
from datetime import datetime, timedelta
from io import StringIO
from email.mime.text import MIMEText
from logging.handlers import TimedRotatingFileHandler
from flask import Flask, jsonify, request, Response, send_file, render_template_string
from functools import wraps
from apscheduler.schedulers.background import BackgroundScheduler
from modules import ai_test_module, database

# ======================================================
# Alert helpers
# ======================================================
def send_email_alert(subject, body):
    host=os.getenv("SMTP_HOST"); port=int(os.getenv("SMTP_PORT",587))
    user=os.getenv("SMTP_USER"); pwd=os.getenv("SMTP_PASS"); to=os.getenv("ALERT_EMAIL")
    if not all([host,user,pwd,to]): return
    msg=MIMEText(body); msg["Subject"]=subject; msg["From"]=user; msg["To"]=to
    try:
        with smtplib.SMTP(host,port) as s:
            s.starttls(); s.login(user,pwd); s.send_message(msg)
    except Exception as e: logging.error(f"Email alert failed: {e}")

def send_slack_alert(msg):
    hook=os.getenv("SLACK_WEBHOOK")
    if not hook: return
    try: requests.post(hook,json={"text":msg})
    except Exception as e: logging.error(f"Slack alert failed: {e}")

# ======================================================
# Logging / Rotation
# ======================================================
env=os.getenv("ENV","development")
log_dir=os.path.join(os.path.dirname(__file__),"..","logs",env)
os.makedirs(log_dir,exist_ok=True)
log_file=os.path.join(log_dir,"app.log")
h=TimedRotatingFileHandler(log_file,when="midnight",interval=1,backupCount=7)
fmt=logging.Formatter("%(asctime)s [%(levelname)s] %(message)s"); h.setFormatter(fmt)
logger=logging.getLogger(); logger.setLevel(getattr(logging,os.getenv("LOG_LEVEL","INFO"))); logger.addHandler(h)

class AlertHandler(logging.Handler):
    def emit(self,record):
        if record.levelno>=logging.ERROR:
            m=self.format(record)
            send_slack_alert(f"🚨 AstraAI [{env}] Error:\n{m}"); send_email_alert(f"AstraAI [{env}] Error",m)
ah=AlertHandler(); ah.setLevel(logging.ERROR); ah.setFormatter(fmt); logger.addHandler(ah)

# ======================================================
# Flask
# ======================================================
app=Flask(__name__)

@app.route("/")
def home(): 
    logging.info(f"Ping ✓ ({env})")
    return jsonify({"status":"AstraAI running","environment":env})

@app.route("/test")
def test(): 
    return jsonify(run_ai_check())

# ======================================================
# Scheduler job
# ======================================================
def run_ai_check():
    try:
        res=ai_test_module.run_test()
        msg=f"AI check OK @ {datetime.now():%Y-%m-%d %H:%M:%S} | {res}"
        logging.info(msg); return {"ok":True,"result":res}
    except Exception as e:
        msg=f"AI check FAIL @ {datetime.now():%Y-%m-%d %H:%M:%S} | {e}"
        logging.error(msg)
        send_slack_alert("🚨 AstraAI Scheduler Error"); send_email_alert("AstraAI Scheduler Error",msg)
        return {"ok":False,"error":str(e)}

def start_scheduler():
    s=BackgroundScheduler(); s.add_job(run_ai_check,"cron",hour=0,minute=0)
    s.start(); logging.info("Scheduler started: daily midnight AI check")

# ======================================================
# Auth Middleware
# ======================================================
API_KEY=os.getenv("METRICS_API_KEY","secret123")
def require_api_key(fn):
    @wraps(fn)
    def inner(*a,**kw):
        k=request.headers.get("X-API-Key") or request.args.get("key")
        if k==API_KEY: return fn(*a,**kw)
        return Response(json.dumps({"error":"Unauthorized"}),status=401,mimetype="application/json")
    return inner

# ======================================================
# Metrics from SQLite
# ======================================================
@app.route("/metrics"); @require_api_key
def metrics():
    data=database.get_last_n(7)
    if not data: return jsonify({"msg":"No data","env":env})
    conf=[r[1] for r in data]; avg=round(sum(conf)/len(conf),3)
    return jsonify({"environment":env,"entries":len(conf),"avg":avg,"data":data})

@app.route("/metrics/filter"); @require_api_key
def metrics_filter():
    days=int(request.args.get("days",7)); target=request.args.get("env",env)
    data=database.get_last_n(days); data=[d for d in data if target in (d[2]or"")]
    if not data: return jsonify({"msg":"No records"})
    conf=[r[1] for r in data]; avg=round(sum(conf)/len(conf),3)
    return jsonify({"environment":target,"days":days,"entries":len(conf),"avg":avg,"data":data})

# ------------------- CSV/JSON Export
@app.route("/metrics/export"); @require_api_key
def export_metrics():
    fmt=request.args.get("format","csv").lower(); envq=request.args.get("env",env)
    data=database.get_last_n(30); data=[d for d in data if envq in (d[2]or"")]
    if not data: return jsonify({"msg":"No data"}),404
    if fmt=="json": return jsonify([{"timestamp":r[0],"confidence":r[1],"status":r[2]} for r in data])
    buf=StringIO(); w=csv.writer(buf); w.writerow(["timestamp","confidence","status"]); w.writerows(data); buf.seek(0)
    return send_file(StringIO(buf.read()),mimetype="text/csv",as_attachment=True,download_name=f"astraai_{envq}.csv")

# ======================================================
# Interactive Dashboard
# ======================================================
@app.route("/dashboard"); @require_api_key
def dashboard():
    html=\"""<!DOCTYPE html><html><head><meta charset='utf‑8'>
    <title>AstraAI Dashboard</title>
    <script src='https://cdn.jsdelivr.net/npm/chart.js'></script>
    <style>body{background:#0e1117;color:#fff;font-family:sans-serif;text-align:center;margin:40px}
    select,input{background:#1a1d23;color:#fff;border:1px solid #444;border-radius:4px;padding:5px 10px;margin:5px}
    canvas{background:#1a1d23;border-radius:6px;box-shadow:0 0 10px #222;max-width:920px}</style></head><body>
    <h1>AstraAI Dashboard</h1>
    <div><label>Env:</label><select id='env'><option>development</option><option selected>ai_testing</option><option>production</option></select>
    <label>Days:</label><input id='days' type='number' value='7' min='1' style='width:60px'><button onclick='load()'>Load</button>
    <button onclick='exportCSV()'>Download CSV</button></div>
    <canvas id='chart' height='400'></canvas>
    <script>
    async function load(){let e=env.value,d=days.value;
      let r=await fetch(`/metrics/filter?env=${e}&days=${d}&key=${new URLSearchParams(location.search).get('key')||'secret123'}`);
      let j=await r.json();if(!j.data){alert('No data');return;}
      const lbl=j.data.map(x=>x[0]);const val=j.data.map(x=>x[1]);
      new Chart(chart,{type:'line',data:{labels:lbl,datasets:[{label:`${e} (${d}d)`,data:val,
      borderColor:'#32a852',backgroundColor:'rgba(50,168,82,0.3)',fill:true,tension:0.35}]},
      options:{plugins:{legend:{labels:{color:'#fff'}}},scales:{x:{ticks:{color:'#ccc'}},y:{min:0,max:1,ticks:{color:'#ccc'}}}}});}
    function exportCSV(){let e=env.value;
      location=`/metrics/export?env=${e}&format=csv&key=${new URLSearchParams(location.search).get('key')||'secret123'}`;}
    window.onload=load;</script></body></html>\"""
    return render_template_string(html)

# ======================================================
if __name__=="__main__":
    logging.info(f"== Starting AstraAI ({env}) ==")
    start_scheduler()
    app.run(host="0.0.0.0",port=5000,debug=(env=="development"))
EOF

# -------------------- MODULES --------------------
cat > app/modules/alerts.py <<'EOF'
import os,logging,smtplib,requests
from email.mime.text import MIMEText
def raise_alert(msg,level="ERROR",notify_slack=True,notify_email=True):
    env=os.getenv("ENV","dev").upper()
    log=f"[{env}] {level}: {msg}"
    getattr(logging,level.lower(),logging.error)(log)
    if notify_slack and os.getenv("SLACK_WEBHOOK"):
        try:requests.post(os.getenv("SLACK_WEBHOOK"),json={"text":f"⚠️ {log}"})
        except Exception as e:logging.error(e)
    if notify_email and level in ("ERROR","CRITICAL"):
        h=os.getenv("SMTP_HOST");u=os.getenv("SMTP_USER");p=os.getenv("SMTP_PASS");to=os.getenv("ALERT_EMAIL")
        if not all([h,u,p,to]):return
        m=MIMEText(log);m["Subject"]=f"AstraAI Alert";m["From"]=u;m["To"]=to
        try:
            import smtplib
            with smtplib.SMTP(h,int(os.getenv("SMTP_PORT",587))) as s:
                s.starttls();s.login(u,p);s.send_message(m)
        except Exception as e:logging.error(e)
EOF

cat > app/modules/database.py <<'EOF'
import sqlite3,os
DB_PATH=os.path.join(os.path.dirname(__file__),"..","..","datasource","astraai.db")
os.makedirs(os.path.dirname(DB_PATH),exist_ok=True)
def connect(): 
    c=sqlite3.connect(DB_PATH,check_same_thread=False)
    c.execute("CREATE TABLE IF NOT EXISTS ai_health(id INTEGER PRIMARY KEY, timestamp TEXT, confidence REAL, status TEXT, environment TEXT)")
    return c
def save_result(env,conf,status):
    with connect() as c:
        c.execute("INSERT INTO ai_health(timestamp,confidence,status,environment) VALUES(datetime('now'),?,?,?)",(conf,status,env));c.commit()
def get_last_n(days=7):
    with connect() as c:
        cur=c.cursor();cur.execute("SELECT timestamp,confidence,status,environment FROM ai_health WHERE timestamp>=datetime('now',?) ORDER BY timestamp",(f'-{days} day',))
        return cur.fetchall()
EOF

cat > app/modules/ai_test_module.py <<'EOF'
import random,logging
from modules import alerts,database
def run_test():
    conf=round(random.uniform(0,1),3)
    logging.info(f"Simulated AI confidence: {conf}")
    if conf>=0.8:
        msg=f"✅ Model passed ({conf})";database.save_result("ai_testing",conf,"PASS");return msg
    elif 0.5<=conf<0.8:
        msg=f"⚠️ Moderate confidence {conf}";alerts.raise_alert(msg,"WARNING",notify_email=False);database.save_result("ai_testing",conf,"WARN");return msg
    else:
        msg=f"🚨 Low confidence {conf}";alerts.raise_alert(msg,"ERROR");database.save_result("ai_testing",conf,"FAIL");return msg
EOF

# -------------------- CONFIGS --------------------
cat > app/requirements.txt <<'EOF'
flask>=2.3.0
requests>=2.31.0
pyyaml>=6.0
python-dotenv>=1.0.0
pydantic>=2.0.0
apscheduler>=3.10.4
EOF

echo "logs setup done ✅"
echo
echo "🎯 AstraAI Pro Ops Suite ready!"
echo "cd AstraAI_Project"
echo "python app/main.py   # or  docker compose up"
EOF
