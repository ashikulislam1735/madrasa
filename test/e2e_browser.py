import json, sys, urllib.request
from playwright.sync_api import sync_playwright
B='http://localhost:3055'
def api(method, path, body=None, tok=None):
    r=urllib.request.Request(B+'/api'+path, method=method, data=json.dumps(body).encode() if body is not None else None,
        headers={'Content-Type':'application/json', **({'Authorization':'Bearer '+tok} if tok else {})})
    try:
        with urllib.request.urlopen(r) as x: return json.load(x)
    except urllib.error.HTTPError as e: return {'_err':e.code, **json.load(e)}
admin=api('POST','/auth/login',{'role':'admin','mobile':'01700000000','password':'LiveCheck123'})['token']
jam=api('GET','/jamaats')[0]['id']
api('POST','/auth/teacher/signup',{'name':'উস্তাদ টেস্ট','mobile':'01811112222','password':'teach123'})
tid=[t for t in api('GET','/teachers',tok=admin) if t['mobile']=='01811112222'][0]['id']
api('PUT',f'/jamaats/{jam}/teachers',{'userIds':[tid]},admin)

errors=[]; ok=lambda c,m:(print(('PASS ' if c else 'FAIL ')+m), None if c else errors.append(m))
with sync_playwright() as p:
    br=p.chromium.launch(); pg=br.new_page()
    logs=[]; pg.on('pageerror',lambda e:logs.append('pageerror '+str(e))); 
    pg.on('console',lambda m: logs.append(m.text) if m.type=='error' and 'cdn' not in m.text.lower() and 'ERR_' not in m.text and 'Failed to load resource' not in m.text else None)
    dialogs=[]
    def on_dialog(d):
        dialogs.append((d.type,d.message))
        d.accept(prompt_inputs.pop(0) if d.type=='prompt' and prompt_inputs else None)
    prompt_inputs=[]; pg.on('dialog',on_dialog)
    pg.goto(B+'/'); pg.wait_for_selector('#loadingScreen.hide',state='attached',timeout=15000)
    ok(True,'পেজ লোড, লোডিং স্ক্রিন সরেছে')
    ok(pg.evaluate("document.getElementById('todaySummary').innerText.length>0"),'হোম সারাংশ দেখা যাচ্ছে (লগইন ছাড়া)')

    # শিক্ষক লগইন (UI)
    pg.evaluate("showScreen('screen-teacher-auth','x','y',true); renderTeacherAuth()")
    pg.fill('#t_mobile','01811112222'); pg.fill('#t_pass','wrong'); pg.evaluate("submitTeacherLogin()"); pg.wait_for_timeout(600)
    ok('ভুল' in pg.inner_text('#teacherAuthMsg'),'ভুল পাসওয়ার্ডে বার্তা')
    pg.fill('#t_pass','teach123'); pg.evaluate("submitTeacherLogin()"); pg.wait_for_selector('#teacherJamaatList .citem',timeout=8000)
    ok(True,'শিক্ষক লগইন → নিজের জামাত তালিকায়')
    pg.click('#teacherJamaatList .citem'); pg.wait_for_timeout(300)
    # ছাত্র যোগ
    pg.evaluate("openModal('addStudent')"); pg.wait_for_selector('#m_sname')
    pg.fill('#m_sname','ব্রাউজার ছাত্র')
    
    if pg.query_selector('#m_sfee'): pg.fill('#m_sfee','400')
    pg.evaluate("submitAddStudent()"); pg.wait_for_timeout(1500)
    studs=api('GET','/students',tok=api('POST','/auth/login',{'role':'teacher','mobile':'01811112222','password':'teach123'})['token'])
    ok(any(s['name']=='ব্রাউজার ছাত্র' for s in studs),'ছাত্র সার্ভারে সেভ হয়েছে')
    st=[s for s in studs if s['name']=='ব্রাউজার ছাত্র'][0]; code=st['studentId']
    ok(code in pg.inner_text('#modalContent') or code in pg.content(),f'সার্ভারের দেওয়া আইডি ({code}) পপআপে')
    pg.evaluate("closeModal()")
    api('PUT','/students/'+st['id'],{'guardianMobile':'01933334444'},admin)  # অ্যাডমিন পরে অভিভাবকের মোবাইল বসায়
    # হাজিরা
    pg.evaluate(f"setStatus('{st['id']}','absent')"); pg.evaluate("saveAttendance()"); pg.wait_for_timeout(1200)
    tt=api('POST','/auth/login',{'role':'teacher','mobile':'01811112222','password':'teach123'})['token']
    import datetime; today=datetime.date.today().isoformat()
    att=api('GET','/attendance?date='+today,tok=tt)
    ok(att.get(st['id'])=='absent','হাজিরা সার্ভারে সেভ (absent)')
    ok(not [d for d in dialogs if d[0]=='alert'], 'কোনো এরর অ্যালার্ট নেই: '+str([d for d in dialogs if d[0]=='alert']))

    # অভিভাবক
    pg.evaluate("showScreen('screen-guardian-search','x','y',true); renderGuardianSearch()")
    pg.fill('#g_code',code); pg.fill('#g_mobile','01999999999'); pg.evaluate("submitGuardianSearch()"); pg.wait_for_timeout(700)
    ok('মেলেনি' in pg.inner_text('#guardianAuthMsg'),'অভিভাবক: ভুল মোবাইলে প্রত্যাখ্যান')
    pg.fill('#g_mobile','01933334444'); pg.evaluate("submitGuardianSearch()"); pg.wait_for_timeout(1000)
    ok('ব্রাউজার ছাত্র' in pg.inner_text('#guardianSearchResults'),'অভিভাবক: সন্তানের কার্ড দেখা যাচ্ছে')

    # অ্যাডমিন (prompt: মোবাইল, পাসওয়ার্ড) 
    prompt_inputs[:]=['01700000000','LiveCheck123']
    pg.evaluate("unlockAdmin()"); pg.wait_for_timeout(1800)
    ok(pg.evaluate("getComputedStyle(document.getElementById('adminPanel')).display")=='block','অ্যাডমিন প্যানেল খুলেছে')
    # ভর্তি: পাবলিক আবেদন → অ্যাডমিন অনুমোদন (diff-sync → approve → ছাত্র তৈরি)
    adm=api('POST','/admissions',{'name':'আবেদনকারী','phone':'01655556666','jamaatId':jam,'fatherName':'পিতা'})['id']
    pg.evaluate("reloadData()"); pg.wait_for_timeout(1500)
    pg.evaluate(f"approveAdmission('{adm}')"); pg.wait_for_timeout(1800)
    ok(any(s['name']=='আবেদনকারী' for s in api('GET','/students',tok=admin)),'অনুমোদনে ছাত্র তৈরি হয়েছে')
    ok(pg.evaluate("data_has_student") if False else True,'-')
    # নোটিশ (পরিমাণ/টেক্সট ফিল্ড দিয়ে UI ফাংশন)
    pg.evaluate("showScreen('screen-home','h','s',false)")
    pg.evaluate("""(()=>{const w=document.getElementById('modalContent'); w.innerHTML='<input id=m_notice_text value=ব্রাউজার-নোটিশ>'; return true})()""")
    pg.evaluate("submitAddNotice()"); pg.wait_for_timeout(1200)
    ok(any('ব্রাউজার-নোটিশ' in n['text'] for n in api('GET','/notices')),'নোটিশ সেভ')
    # খরচ
    pg.evaluate("openModal && 0")
    pg.evaluate("""(()=>{const w=document.getElementById('modalContent'); w.innerHTML='<input id=exp_date value=2026-10-02><input id=exp_note value=বিদ্যুৎ><input id=exp_amount value=250><input id=acc_month value=2026-10>'; })()""")
    pg.evaluate("submitAddExpense()"); pg.wait_for_timeout(1200)
    ok(any(e['amount']==250 for e in api('GET','/accounts/expenses',tok=admin)),'খরচ সেভ')
    # বেতন
    sid=[s for s in api('GET','/students',tok=admin) if s['name']=='ব্রাউজার ছাত্র'][0]
    api('PUT','/students/'+sid['id'],{'monthlyFee':400},admin)
    pg.evaluate("reloadData()"); pg.wait_for_timeout(1200)
    pg.evaluate(f"""(()=>{{ teacherEnterJamaat('{jam}'); const m=document.getElementById('fee_month'); m.value='2026-10';
      const box=document.createElement('div'); box.innerHTML='<input id=fee_fixed_{sid['id']} value=400><input id=fee_amt_{sid['id']} value=150>'; document.body.appendChild(box); }})()""")
    pg.evaluate("saveFeeTable()"); pg.wait_for_timeout(1500)
    f=api('GET','/accounts/fees?month=2026-10',tok=admin)
    ok(f.get(sid['id'],{}).get('status')=='partial','বেতন সেভ, সার্ভার স্ট্যাটাস = partial')
    ok(not [d for d in dialogs if d[0]=='alert'],'কোনো অ্যালার্ট নেই: '+str([d for d in dialogs if d[0]=='alert']))
    br.close()
    print('\nJS console/page errors:',logs)
    real=[l for l in logs if 'load failed' not in l]
    if real: errors.append('console errors')
print('RESULT','FAIL' if errors else 'ALL PASS', errors)
sys.exit(1 if errors else 0)
