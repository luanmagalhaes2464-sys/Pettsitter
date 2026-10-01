let csrf='',bookingsCache=[],financeCache={payments:[],expenses:[]},editingPaymentId='',editingExpenseId='';const money=new Intl.NumberFormat('pt-BR',{style:'currency',currency:'BRL'}),dateFmt=new Intl.DateTimeFormat('pt-BR',{timeZone:'UTC'});const $=s=>document.querySelector(s),$$=s=>document.querySelectorAll(s);function esc(v=''){return String(v).replace(/[&<>'"]/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;',"'":'&#39;','"':'&quot;'}[c]))}function fd(form){return Object.fromEntries(new FormData(form).entries())}function today(){const d=new Date();return `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,'0')}-${String(d.getDate()).padStart(2,'0')}`}
async function api(url,opt={}){opt.headers={...(opt.headers||{}),'Content-Type':'application/json'};if(!['GET','HEAD'].includes((opt.method||'GET').toUpperCase()))opt.headers['x-csrf-token']=csrf;const r=await fetch(url,opt);if(r.status===401){location.href='/login';throw new Error('Sessão expirada')}const j=await r.json().catch(()=>({}));if(!r.ok)throw new Error(j.error||'Erro na solicitação');return j}
async function boot(){const r=await fetch('/api/auth/me');if(!r.ok){location.href='/login';return}const j=await r.json();csrf=j.csrfToken;$('#userName').textContent=j.user.name;setDates();await Promise.all([loadDashboard(),loadBookings(),loadVaccines(),loadFinance(),loadIntegrations()])}
function setDates(){$('#paymentForm [name=paidAt]').value=today();$('#expenseForm [name=occurredAt]').value=today()}
$$('.tab-btn').forEach(b=>b.addEventListener('click',()=>{$$('.tab-btn').forEach(x=>x.classList.remove('active'));$$('.tab-panel').forEach(x=>x.classList.remove('active'));b.classList.add('active');$('#tab-'+b.dataset.tab).classList.add('active')}));
$('#logoutBtn').addEventListener('click',async()=>{await api('/api/auth/logout',{method:'POST',body:'{}'});location.href='/login'});$('#refreshDashboard').addEventListener('click',loadDashboard);$('#dashFilterBtn').addEventListener('click',loadDashboard);
async function loadDashboard(){const q=new URLSearchParams();if($('#dashFrom').value)q.set('from',$('#dashFrom').value);if($('#dashTo').value)q.set('to',$('#dashTo').value);if($('#dashService').value)q.set('service',$('#dashService').value);if($('#dashFrom').value&&$('#dashTo').value&&$('#dashFrom').value>$('#dashTo').value){alert('A data final deve ser igual ou posterior à inicial.');return}const j=await api('/api/admin/dashboard?'+q.toString());$('#mReceived').textContent=money.format(j.summary.received);$('#mExpenses').textContent=money.format(j.summary.expenses);$('#mNet').textContent=money.format(j.summary.net);$('#mContracted').textContent=money.format(j.summary.contracted);$('#mBookings').textContent=j.summary.bookings;$('#mClients').textContent=j.summary.clients;$('#recentBookings').innerHTML=tableBookings(j.recent,true);const max=Math.max(1,...j.monthly.map(x=>Math.max(x.received,x.expenses)));$('#monthlyChart').innerHTML=j.monthly.length?j.monthly.map(x=>`<div class="bar-row"><span>${esc(x.month.slice(5))}/${esc(x.month.slice(2,4))}</span><div class="bar-stack"><i class="bar received" style="width:${x.received/max*100}%" title="Recebido ${money.format(x.received)}"></i><i class="bar expense" style="width:${x.expenses/max*100}%" title="Despesas ${money.format(x.expenses)}"></i></div><small>${money.format(x.received-x.expenses)}</small></div>`).join(''):'<div class="empty">Sem movimentação no período.</div>';$('#serviceBreakdown').innerHTML=j.byService?.length?`<table><thead><tr><th>Serviço</th><th>Atendimentos</th><th>Recebido</th></tr></thead><tbody>${j.byService.map(x=>`<tr><td>${esc(x.serviceLabel)}</td><td>${x.bookings}</td><td><strong>${money.format(x.received)}</strong></td></tr>`).join('')}</tbody></table>`:'<div class="empty">Ainda não há recebimentos vinculados a serviços nesse período.</div>'}
function tableBookings(rows,compact=false){
  if(!rows.length)return'<div class="empty">Nenhum atendimento encontrado.</div>';
  return`<table><thead><tr><th>Tutor</th><th>Serviço</th><th>Data</th><th>Valor</th><th>Status</th>${compact?'':'<th>Gerenciar</th>'}</tr></thead><tbody>${rows.map(b=>`<tr><td><strong>${esc(b.tutorName)}</strong><small>${esc(b.animals||'')}</small><small><a target="_blank" rel="noreferrer" href="https://wa.me/${String(b.phone||'').replace(/\D/g,'').replace(/^(?!55)(\d{10,11})$/,'55$1')}">${esc(b.phone||'')}</a></small></td><td>${esc(b.serviceLabel)}<small>Origem: ${esc(b.sourceLabel||'Site')}</small></td><td>${esc(bookingDateText(b))}</td><td>${b.estimatedTotal==null?'A confirmar':money.format(b.estimatedTotal)}</td><td><span class="status ${esc(b.status)}">${esc(b.statusLabel)}</span>${b.calendarLinked?'<small class="calendar-ok">Na agenda</small>':''}</td>${compact?'':`<td><div class="row-actions"><select class="status-select" data-id="${b.id}" aria-label="Alterar status de ${esc(b.tutorName)}"><option value="new" ${b.status==='new'?'selected':''}>Nova</option><option value="analyzing" ${b.status==='analyzing'?'selected':''}>Em análise</option><option value="confirmed" ${b.status==='confirmed'?'selected':''}>Confirmada</option><option value="completed" ${b.status==='completed'?'selected':''}>Concluída</option><option value="cancelled" ${b.status==='cancelled'?'selected':''}>Cancelada</option></select>${['confirmed','completed'].includes(b.status)&&!b.calendarLinked?`<button class="btn-icon calendar-retry" data-id="${b.id}" title="Vincular à agenda" aria-label="Vincular ${esc(b.tutorName)} à agenda">Agenda</button>`:''}<button class="btn-icon edit-booking" data-id="${b.id}" title="Editar atendimento" aria-label="Editar atendimento de ${esc(b.tutorName)}">Editar</button><button class="btn-icon danger delete-booking" data-id="${b.id}" title="Excluir atendimento" aria-label="Excluir atendimento de ${esc(b.tutorName)}">Excluir</button></div></td>`}</tr>`).join('')}</tbody></table>`
}
function bookingDateText(b){if(b.dateMode==='specific'&&Array.isArray(b.specificDates)&&b.specificDates.length){return b.specificDates.length+' datas: '+b.specificDates.slice(0,3).map(d=>dateFmt.format(new Date(d+'T12:00:00Z'))).join(', ')+(b.specificDates.length>3?' +'+(b.specificDates.length-3):'')}return dateFmt.format(new Date(b.startDate))}
function toast(message,type='success'){const el=$('#adminToast');if(!el)return;el.textContent=message;el.className='admin-toast show '+type;clearTimeout(toast.timer);toast.timer=setTimeout(()=>el.className='admin-toast',4500)}
async function loadBookings(){
  const q=new URLSearchParams();if($('#bookingStatus').value)q.set('status',$('#bookingStatus').value);if($('#bookingSearch').value.trim())q.set('search',$('#bookingSearch').value.trim());
  const j=await api('/api/admin/bookings?'+q.toString());bookingsCache=j.bookings;$('#bookingsTable').innerHTML=tableBookings(j.bookings);
  $$('.status-select').forEach(s=>s.addEventListener('change',async()=>{const previous=bookingsCache.find(b=>b.id===s.dataset.id)?.status||'new';s.disabled=true;try{const result=await api('/api/admin/bookings/'+s.dataset.id,{method:'PATCH',body:JSON.stringify({status:s.value})});if(s.value==='confirmed')toast(result.calendarLinked?'Atendimento confirmado e vinculado à agenda.':'Atendimento confirmado. Autorize o Google Agenda e use o botão Agenda.',result.calendarLinked?'success':'error');if(s.value==='completed'&&result.paymentCreated)toast('Atendimento concluído e recebimento via Pix registrado.');await Promise.all([loadDashboard(),loadFinance(),loadBookings()])}catch(e){s.value=previous;s.disabled=false;toast(e.message,'error')}}));
  $$('.calendar-retry').forEach(btn=>btn.addEventListener('click',async()=>{btn.disabled=true;try{await api('/api/admin/bookings/'+btn.dataset.id+'/calendar',{method:'POST',body:'{}'});toast('Atendimento vinculado à agenda de Luan e Isabela.');await loadBookings()}catch(e){toast(e.message,'error');btn.disabled=false}}));
  $$('.edit-booking').forEach(btn=>btn.addEventListener('click',()=>openBookingEditor(btn.dataset.id)));
  $$('.delete-booking').forEach(btn=>btn.addEventListener('click',()=>openDeleteDialog(btn.dataset.id)));
  fillBookingSelect();
}
let bookingEditorId='',adminPriceManual=false,adminSpecificDates=[],adminSpecificSchedule=[];
const adminCountNames=['dogCount','catCount','birdCount','hamsterCount','guineaPigCount','fishCount','otherCount'];
function setBookingEditorField(name,value){const el=$('#bookingEditorForm [name="'+name+'"]');if(el)el.value=value==null?'':value}
function adminCount(name){return Math.max(0,Number($('#bookingEditorForm [name="'+name+'"]')?.value||0))}
function adminDate(v){return v?new Date(v+'T12:00:00'):null}
function adminInclusiveDays(a,b){if(!a||!b||b<a)return 0;return Math.floor((b-a)/86400000)+1}
function adminStayDays(a,b){if(!a||!b||b<a)return 0;return Math.max(1,Math.ceil((b-a)/86400000))}
function adminScheduleVisits(date){return Math.max(1,Math.min(10,Number(adminSpecificSchedule.find(x=>x.date===date)?.visits||$('#bookingEditorForm [name="visits"]')?.value||1)))}
function syncAdminSchedule(){adminSpecificSchedule=adminSpecificDates.map(date=>({date,visits:adminScheduleVisits(date)}))}
function renderAdminSpecificDates(){const el=$('#adminSpecificDateList'),service=$('#bookingEditorForm [name="service"]').value,withVisits=['pet_sitter','pet_sitter_passeio'].includes(service);syncAdminSchedule();el.innerHTML=adminSpecificDates.length?adminSpecificDates.map(d=>`<div class="date-schedule-row" data-date="${d}"><strong>${dateFmt.format(new Date(d+'T12:00:00Z'))}</strong>${withVisits?`<label>Visitas <input class="admin-specific-visit-input" data-date="${d}" type="number" min="1" max="10" value="${adminScheduleVisits(d)}"></label>`:''}<button type="button" class="date-remove admin-date-remove" data-date="${d}" aria-label="Remover data">×</button></div>`).join(''):'<span class="muted">Nenhuma data adicionada.</span>'}
function parseAnimalSummary(summary,total=0){
  const s=String(summary||''),pick=re=>Number(s.match(re)?.[1]||0);
  const result={
    dogCount:pick(/(\d+)\s+cão/i),catCount:pick(/(\d+)\s+gato/i),birdCount:pick(/(\d+)\s+ave/i),
    hamsterCount:pick(/(\d+)\s+hamster/i),guineaPigCount:pick(/(\d+)\s+porquinho/i),fishCount:pick(/(\d+)\s+peixe/i),
    otherCount:0,otherAnimals:'',petNames:(s.match(/—\s*nomes:\s*(.+)$/i)?.[1]||'').trim()
  };
  const known=result.dogCount+result.catCount+result.birdCount+result.hamsterCount+result.guineaPigCount+result.fishCount;
  if(!known&&Number(total)>0){result.otherCount=Number(total);result.otherAnimals=s.replace(/—\s*nomes:.*$/i,'').trim()||'outro(s)'}
  else if(Number(total)>known){result.otherCount=Number(total)-known;result.otherAnimals='outro(s)'}
  return result;
}
function updateAdminServiceFields(){
  const form=$('#bookingEditorForm'),service=form.elements.service.value,needsVisits=['pet_sitter','pet_sitter_passeio'].includes(service),needsAddress=service!=='hospedagem',supportsSpecific=['pet_sitter','pet_sitter_passeio','passeio'].includes(service);
  const specific=supportsSpecific&&form.elements.dateMode.value==='specific';
  $('#adminVisitsWrap').hidden=!needsVisits||specific;form.elements.visits.required=needsVisits&&!specific;if(!needsVisits)form.elements.visits.value=1;
  $('#adminAddressFields').hidden=!needsAddress;form.elements.street.required=needsAddress;form.elements.neighborhood.required=needsAddress;
  $('#adminAddressHint').textContent=service==='hospedagem'?'Hospedagem: não é necessário informar o endereço do tutor.':'';
  $('#adminDateModeWrap').hidden=!supportsSpecific;if(!supportsSpecific)form.elements.dateMode.value='range';
  $('#adminRangeDateFields').classList.toggle('hidden',specific);$('#adminSpecificDateFields').classList.toggle('hidden',!specific);
  form.elements.startDate.required=!specific;form.elements.endDate.required=!specific;
}
function calculateAdminPrice(force=false){
  updateAdminServiceFields();
  const form=$('#bookingEditorForm'),service=form.elements.service.value,start=adminDate(form.elements.startDate.value),end=adminDate(form.elements.endDate.value),visits=Math.max(1,Number(form.elements.visits.value||1));
  const dogs=adminCount('dogCount'),cats=adminCount('catCount'),small=adminCount('birdCount')+adminCount('hamsterCount')+adminCount('guineaPigCount')+adminCount('fishCount')+adminCount('otherCount');
  const specific=form.elements.dateMode.value==='specific'&&['pet_sitter','pet_sitter_passeio','passeio'].includes(service),days=specific?adminSpecificDates.length:adminInclusiveDays(start,end),totalVisits=specific?adminSpecificSchedule.reduce((sum,x)=>sum+Number(x.visits||1),0):days*visits;let total=null,detail='Selecione serviço e datas.';
  if(!specific&&start&&end&&end<start)detail='A data final precisa ser igual ou posterior à inicial.';
  else if(specific&&!adminSpecificDates.length)detail='Adicione pelo menos uma data.';
  else if(service&&days>0){
    if(service==='pet_sitter'){total=totalVisits*35;detail=specific?totalVisits+' visita(s) distribuída(s) em '+days+' dia(s) × R$ 35':days+' dia(s) × '+visits+' visita(s)/dia × R$ 35 — sem acréscimo por quantidade de animais'}
    else if(service==='pet_sitter_passeio'){if(!dogs)detail='Informe ao menos um cão para calcular o passeio.';else{const rate=35+(15*dogs);total=totalVisits*rate;detail=specific?totalVisits+' visita(s) em '+days+' dia(s) × (R$ 35 + R$ 15 × '+dogs+' cão(ães))':days+' dia(s) × '+visits+' visita(s)/dia × (R$ 35 + R$ 15 × '+dogs+' cão(ães))'}}
    else if(service==='passeio'){if(!dogs)detail='Informe ao menos um cão para calcular o passeio.';else{total=days*dogs*50;detail=days+' passeio(s) × '+dogs+' cão(ães) × R$ 50'}}
    else if(service==='hospedagem'){const d=adminStayDays(start,end),billable=dogs+cats,known=d*billable*65;if(small||!billable){detail=(billable?d+' diária(s) × '+billable+' cão/gato × R$ 65 = '+money.format(known)+'; ':'')+'demais animais: valor a validar'}else{total=known;detail=d+' diária(s) × '+billable+' cão/gato × R$ 65'}}
    else if(service==='vacinacao')detail='Valor definido após avaliação do protocolo e da vacina indicada.';
  }
  if(force)adminPriceManual=false;
  if(!adminPriceManual)$('#adminEstimatedTotal').value=total==null?'':Number(total).toFixed(2);
  $('#adminPriceDetail').textContent=adminPriceManual?'Valor ajustado manualmente. Clique em “Usar valor automático” para recalcular.':detail;
  return{total,detail};
}
function openBookingEditor(id=''){
  const dialog=$('#bookingEditorDialog'),form=$('#bookingEditorForm'),msg=$('#bookingEditorMessage');
  bookingEditorId=id;adminPriceManual=false;adminSpecificDates=[];adminSpecificSchedule=[];form.reset();msg.className='form-message';msg.textContent='';
  setBookingEditorField('source','whatsapp');setBookingEditorField('status','new');setBookingEditorField('service','pet_sitter');setBookingEditorField('dateMode','range');setBookingEditorField('visits','1');setBookingEditorField('startDate',today());setBookingEditorField('endDate',today());
  adminCountNames.forEach(name=>setBookingEditorField(name,0));setBookingEditorField('otherAnimals','');setBookingEditorField('petNames','');
  const editing=Boolean(id),b=editing?bookingsCache.find(x=>x.id===id):null;
  $('#bookingEditorTitle').textContent=editing?'Editar atendimento':'Novo atendimento';
  $('#bookingEditorSubtitle').textContent=editing?'Corrija os dados da solicitação. Os campos mudam conforme o serviço e o valor segue a mesma regra do site.':'Cadastre uma solicitação recebida fora do site. Os campos e o valor se ajustam conforme o serviço.';
  $('#bookingEditorStatusWrap').hidden=editing;
  $('#bookingEditorHint').textContent=editing?'Se este atendimento já estiver na agenda, o sistema tentará atualizar o evento. Pagamentos já lançados não são alterados automaticamente.':'Ao criar como Confirmada, o sistema tentará vinculá-la à agenda. Ao criar como Concluída com valor, o recebimento será registrado conforme a regra atual do financeiro.';
  if(b){
    setBookingEditorField('source',b.source||'site');setBookingEditorField('service',b.service);setBookingEditorField('dateMode',b.dateMode||'range');adminSpecificDates=[...(b.specificDates||[])];adminSpecificSchedule=(b.specificSchedule||adminSpecificDates.map(date=>({date,visits:b.visits||1}))).map(x=>({date:x.date,visits:Number(x.visits||1)}));setBookingEditorField('visits',b.visits||1);
    setBookingEditorField('startDate',String(b.startDate||'').slice(0,10));setBookingEditorField('endDate',String(b.endDate||'').slice(0,10));
    setBookingEditorField('tutorName',b.tutorName);setBookingEditorField('phone',b.phone);setBookingEditorField('street',b.service==='hospedagem'?'':b.street);setBookingEditorField('neighborhood',b.service==='hospedagem'?'':b.neighborhood);
    const parsed=parseAnimalSummary(b.animals,b.animalCount);Object.entries(parsed).forEach(([name,value])=>setBookingEditorField(name,value));
    setBookingEditorField('estimatedTotal',b.estimatedTotal==null?'':b.estimatedTotal);setBookingEditorField('notes',b.notes||'');
    adminPriceManual=/ajustado manualmente|valor informado|registro administrativo|editado no administrativo/i.test(String(b.priceDetail||''));
  }
  renderAdminSpecificDates();updateAdminServiceFields();
  if(!adminPriceManual)calculateAdminPrice();else $('#adminPriceDetail').textContent='Valor ajustado manualmente. Clique em “Usar valor automático” para recalcular.';
  dialog.showModal();
}
$('#addBookingBtn').addEventListener('click',()=>openBookingEditor());
$('#closeBookingEditor').addEventListener('click',()=>$('#bookingEditorDialog').close());
$('#cancelBookingEditor').addEventListener('click',()=>$('#bookingEditorDialog').close());
$('#adminResetPrice').addEventListener('click',()=>calculateAdminPrice(true));
$('#adminAddSpecificDate').addEventListener('click',()=>{const input=$('#adminSpecificDateInput'),v=input.value;if(!v)return;if(!adminSpecificDates.includes(v)){adminSpecificDates.push(v);adminSpecificSchedule.push({date:v,visits:Math.max(1,Number($('#bookingEditorForm [name="visits"]').value||1))})}adminSpecificDates.sort();input.value='';renderAdminSpecificDates();calculateAdminPrice()});
$('#adminSpecificDateList').addEventListener('click',e=>{const btn=e.target.closest('.admin-date-remove');if(!btn)return;adminSpecificDates=adminSpecificDates.filter(x=>x!==btn.dataset.date);adminSpecificSchedule=adminSpecificSchedule.filter(x=>x.date!==btn.dataset.date);renderAdminSpecificDates();calculateAdminPrice()});
$('#adminSpecificDateList').addEventListener('input',e=>{if(!e.target.classList.contains('admin-specific-visit-input'))return;const item=adminSpecificSchedule.find(x=>x.date===e.target.dataset.date);if(item)item.visits=Math.max(1,Math.min(10,Number(e.target.value||1)));calculateAdminPrice()});
$('#bookingEditorForm [name="dateMode"]').addEventListener('change',()=>{renderAdminSpecificDates();calculateAdminPrice()});
$('#adminEstimatedTotal').addEventListener('input',()=>{adminPriceManual=true;$('#adminPriceDetail').textContent='Valor ajustado manualmente. Clique em “Usar valor automático” para recalcular.'});
['visits','startDate','endDate',...adminCountNames].forEach(name=>$('#bookingEditorForm [name="'+name+'"]')?.addEventListener('input',()=>calculateAdminPrice()));
$('#bookingEditorForm [name="service"]').addEventListener('change',()=>{renderAdminSpecificDates();calculateAdminPrice()});
$('#bookingEditorForm').addEventListener('submit',async e=>{
  e.preventDefault();const form=e.currentTarget,btn=$('#saveBookingEditor'),msg=$('#bookingEditorMessage'),payload=fd(form);
  payload.visits=Number(payload.visits||1);adminCountNames.forEach(name=>payload[name]=Number(payload[name]||0));
  const specific=payload.dateMode==='specific'&&['pet_sitter','pet_sitter_passeio','passeio'].includes(payload.service);payload.dateMode=specific?'specific':'range';payload.specificDates=specific?[...adminSpecificDates]:[];payload.specificSchedule=specific?adminSpecificSchedule.map(x=>({date:x.date,visits:Math.max(1,Math.min(10,Number(x.visits||1)))})):[];if(specific){if(!adminSpecificDates.length){msg.className='form-message error';msg.textContent='Adicione pelo menos uma data.';return}payload.startDate=adminSpecificDates[0];payload.endDate=adminSpecificDates[adminSpecificDates.length-1]}
  payload.estimatedTotal=payload.estimatedTotal===''?null:Number(payload.estimatedTotal);payload.autoPrice=!adminPriceManual;
  if(bookingEditorId)delete payload.status;
  btn.disabled=true;msg.className='form-message';msg.textContent='Salvando...';
  try{
    const result=await api(bookingEditorId?'/api/admin/bookings/'+bookingEditorId:'/api/admin/bookings',{method:bookingEditorId?'PUT':'POST',body:JSON.stringify(payload)});
    const wasEdit=Boolean(bookingEditorId);$('#bookingEditorDialog').close();bookingEditorId='';
    if(wasEdit&&result.financeUnchanged)toast('Atendimento atualizado. Os lançamentos financeiros existentes não foram alterados.');
    else if(!wasEdit&&payload.status==='confirmed'&&!result.calendarLinked)toast('Atendimento criado e confirmado. A agenda não foi vinculada automaticamente.','error');
    else toast(wasEdit?'Atendimento atualizado.':'Atendimento adicionado.');
    await Promise.all([loadDashboard(),loadFinance(),loadBookings()]);
  }catch(err){msg.className='form-message error';msg.textContent=err.message}finally{btn.disabled=false}
});
$('#bookingEditorDialog').addEventListener('close',()=>{bookingEditorId='';adminPriceManual=false;adminSpecificDates=[];adminSpecificSchedule=[];$('#bookingEditorMessage').textContent='';});

let bookingToDelete='';
function openDeleteDialog(id){const booking=bookingsCache.find(b=>b.id===id);bookingToDelete=id;$('#deleteBookingText').textContent=`O registro de ${booking?.tutorName||'este tutor'} será removido permanentemente${booking?.calendarLinked?' e o evento correspondente será excluído da agenda.':'.'}`;$('#deleteBookingDialog').showModal()}
$('#deleteBookingDialog').addEventListener('close',async()=>{if($('#deleteBookingDialog').returnValue!=='confirm'||!bookingToDelete){bookingToDelete='';return}const id=bookingToDelete;bookingToDelete='';try{await api('/api/admin/bookings/'+id,{method:'DELETE',body:'{}'});toast('Atendimento excluído.');await Promise.all([loadDashboard(),loadFinance(),loadBookings()])}catch(e){toast(e.message,'error')}});
$('#bookingFilterBtn').addEventListener('click',loadBookings);$('#bookingSearch').addEventListener('keydown',e=>{if(e.key==='Enter')loadBookings()});function fillBookingSelect(){const sel=$('#paymentBooking'),cur=sel.value;sel.innerHTML='<option value="">Sem vínculo</option>'+bookingsCache.map(b=>`<option value="${b.id}" data-total="${b.estimatedTotal==null?'':b.estimatedTotal}">${esc(b.tutorName)} • ${esc(b.serviceLabel)} • ${dateFmt.format(new Date(b.startDate))}${b.estimatedTotal==null?' • a confirmar':' • '+money.format(b.estimatedTotal)}</option>`).join('');sel.value=cur;if(cur)fillAgreedAmount()}
function fillAgreedAmount(){const sel=$('#paymentBooking'),amount=$('#paymentForm [name=amount]'),option=sel.options[sel.selectedIndex],total=option?.dataset.total;if(total!==undefined&&total!=='')amount.value=Number(total).toFixed(2);else if(sel.value)amount.value=''}
$('#paymentBooking').addEventListener('change',fillAgreedAmount);
async function loadFinance(){
  const j=await api('/api/admin/finance');financeCache=j;
  $('#paymentsTable').innerHTML=financeTable(j.payments,'payment');$('#expensesTable').innerHTML=financeTable(j.expenses,'expense');
  $$('.finance-edit').forEach(btn=>btn.addEventListener('click',()=>editFinance(btn.dataset.type,btn.dataset.id)));
  $$('.finance-delete').forEach(btn=>btn.addEventListener('click',()=>deleteFinance(btn.dataset.type,btn.dataset.id)));
}
function financeTable(rows,type){if(!rows.length)return'<div class="empty">Nenhum lançamento.</div>';return`<table><thead><tr><th>Data</th><th>${type==='payment'?'Origem':'Categoria'}</th><th>Valor</th><th>Ações</th></tr></thead><tbody>${rows.map(x=>`<tr><td>${dateFmt.format(new Date(type==='payment'?x.paid_at:x.occurred_at))}</td><td>${esc(type==='payment'?(x.tutor_name||x.note||x.method):(x.category+(x.note?' • '+x.note:'')))}</td><td><strong>${money.format(x.amount)}</strong></td><td><div class="row-actions finance-actions"><button class="btn-icon finance-edit" data-type="${type}" data-id="${x.id}">Editar</button><button class="btn-icon danger finance-delete" data-type="${type}" data-id="${x.id}">Excluir</button></div></td></tr>`).join('')}</tbody></table>`}
function resetFinanceEdit(type){
  if(type==='payment'){editingPaymentId='';$('#paymentForm').reset();$('#paymentSaveBtn').textContent='Salvar recebimento via Pix';$('#paymentCancelEdit').classList.add('hidden')}
  else{editingExpenseId='';$('#expenseForm').reset();$('#expenseSaveBtn').textContent='Salvar despesa';$('#expenseCancelEdit').classList.add('hidden')}
  setDates();
}
function editFinance(type,id){
  if(type==='payment'){const x=financeCache.payments.find(v=>v.id===id);if(!x)return;editingPaymentId=id;const f=$('#paymentForm');f.elements.bookingId.value=x.booking_id||'';f.elements.amount.value=Number(x.amount).toFixed(2);f.elements.paidAt.value=String(x.paid_at).slice(0,10);f.elements.note.value=x.note||'';$('#paymentSaveBtn').textContent='Salvar alteração';$('#paymentCancelEdit').classList.remove('hidden');f.scrollIntoView({behavior:'smooth',block:'center'})}
  else{const x=financeCache.expenses.find(v=>v.id===id);if(!x)return;editingExpenseId=id;const f=$('#expenseForm');f.elements.amount.value=Number(x.amount).toFixed(2);f.elements.category.value=x.category||'';f.elements.occurredAt.value=String(x.occurred_at).slice(0,10);f.elements.note.value=x.note||'';$('#expenseSaveBtn').textContent='Salvar alteração';$('#expenseCancelEdit').classList.remove('hidden');f.scrollIntoView({behavior:'smooth',block:'center'})}
}
async function deleteFinance(type,id){
  const label=type==='payment'?'este recebimento':'esta despesa';if(!confirm('Excluir '+label+'? Essa ação corrige o dashboard imediatamente.'))return;
  try{await api('/api/admin/'+(type==='payment'?'payments':'expenses')+'/'+id,{method:'DELETE',body:'{}'});toast(type==='payment'?'Recebimento excluído.':'Despesa excluída.');resetFinanceEdit(type);await Promise.all([loadFinance(),loadDashboard()])}catch(e){toast(e.message,'error')}
}
async function submitFinance(form,type){
  const msg=form.querySelector('.form-message'),editingId=type==='payment'?editingPaymentId:editingExpenseId,url='/api/admin/'+(type==='payment'?'payments':'expenses')+(editingId?'/'+editingId:'');
  msg.className='form-message';msg.textContent='Salvando...';
  try{await api(url,{method:editingId?'PUT':'POST',body:JSON.stringify(fd(form))});msg.className='form-message success';msg.textContent=editingId?'Alteração salva.':'Salvo com sucesso.';resetFinanceEdit(type);await Promise.all([loadFinance(),loadDashboard(),loadBookings()])}catch(e){msg.className='form-message error';msg.textContent=e.message}
}
$('#paymentCancelEdit').addEventListener('click',()=>resetFinanceEdit('payment'));$('#expenseCancelEdit').addEventListener('click',()=>resetFinanceEdit('expense'));
$('#paymentForm').addEventListener('submit',e=>{e.preventDefault();submitFinance(e.currentTarget,'payment')});$('#expenseForm').addEventListener('submit',e=>{e.preventDefault();submitFinance(e.currentTarget,'expense')});$('#passwordForm').addEventListener('submit',async e=>{e.preventDefault();const form=e.currentTarget,msg=form.querySelector('.form-message');try{await api('/api/auth/change-password',{method:'POST',body:JSON.stringify(fd(form))});msg.className='form-message success';msg.textContent='Senha alterada.';form.reset()}catch(err){msg.className='form-message error';msg.textContent=err.message}});boot();

async function loadIntegrations(){try{
  const j=await api('/api/admin/integrations');
  const cards=$('#integrationCards');
  if(cards)cards.innerHTML=[
    ['Banco de dados',j.database?'Conectado':'Indisponível',j.database?'Histórico e financeiro estão persistentes.':'O sistema não consegue gravar dados.'],
    ['E-mail de nova pré-reserva',j.emailApi?'Ativo':(j.emailAutomatic?'Aguardando Google':'Pendente'),j.emailApi?'Envio ativo pelo '+j.emailProvider+'.':'O SMTP é bloqueado no plano gratuito do Render. Conecte o Gmail do Luan pelo Google HTTPS; as solicitações continuam salvas em Atendimentos.'],

    ['Agenda ao confirmar',j.calendarAutomatic?'Automática':'Pendente',j.calendarAutomatic?'Confirmar um atendimento cria o evento para Luan e convida Isabela.':'A autorização do Google Agenda ainda precisa ser concluída.'],
    ['Agenda por assinatura',j.calendarFeed?'Ativa':'Indisponível',j.calendarFeed?'Visualização complementar dos atendimentos confirmados.':'Feed não configurado.']
  ].map(x=>`<article class="panel-card"><div class="eyebrow">${esc(x[0])}</div><h2>${esc(x[1])}</h2><p class="muted">${esc(x[2])}</p></article>`).join('');
  if($('#calendarFeedUrl'))$('#calendarFeedUrl').value=j.calendarFeedUrl||'';
}catch(e){console.error(e)}}
if($('#copyCalendarFeed'))$('#copyCalendarFeed').addEventListener('click',async()=>{const input=$('#calendarFeedUrl'),msg=$('#copyCalendarMessage');try{await navigator.clipboard.writeText(input.value);msg.className='form-message success';msg.textContent='URL copiada.'}catch{input.select();document.execCommand('copy');msg.className='form-message success';msg.textContent='URL copiada.'}});
if($('#checkCalendarBtn'))$('#checkCalendarBtn').addEventListener('click',async()=>{const btn=$('#checkCalendarBtn'),msg=$('#integrationTestMessage');btn.disabled=true;msg.className='form-message';msg.textContent='Verificando autorização...';try{const j=await api('/api/admin/integrations/check-calendar',{method:'POST',body:'{}'});msg.className='form-message success';msg.textContent='Google Agenda autorizado e pronto: '+j.calendarName+'.'}catch(e){msg.className='form-message error';msg.textContent=e.message}finally{btn.disabled=false}});
if($('#testEmailBtn'))$('#testEmailBtn').addEventListener('click',async()=>{const btn=$('#testEmailBtn'),msg=$('#testEmailMessage');btn.disabled=true;msg.className='form-message';msg.textContent='Enviando...';try{await api('/api/admin/integrations/test-email',{method:'POST',body:'{}'});msg.className='form-message success';msg.textContent='E-mail enviado para Luan e Isabela. Confira também a caixa de spam.'}catch(e){msg.className='form-message error';msg.textContent=e.message}finally{btn.disabled=false}});

async function loadVaccines(){try{
  const j=await api('/api/admin/vaccines');
  const due=$('#dueVaccines'),cards=$('#vaccineCards');
  if(due)due.innerHTML=j.due.length?`<table><thead><tr><th>Pet</th><th>Vacina</th><th>Próxima dose</th><th>Tutor</th><th>Ação</th></tr></thead><tbody>${j.due.map(x=>`<tr><td><strong>${esc(x.petName)}</strong><small>${esc(x.species)}</small></td><td>${esc(x.vaccineName)}</td><td>${dateFmt.format(new Date(x.nextDueDate))}</td><td>${esc(x.tutorName)}<small>${esc(x.tutorPhone)}</small></td><td><a class="btn btn-small btn-ghost" target="_blank" rel="noreferrer" href="${x.whatsappUrl}">Lembrar tutor</a></td></tr>`).join('')}</tbody></table>`:'<div class="empty">Nenhuma dose prevista para os próximos 30 dias.</div>';
  if(cards)cards.innerHTML=j.cards.length?`<table><thead><tr><th>Pet</th><th>Tutor</th><th>Última vacina</th><th>Próxima dose</th><th>Cartão</th></tr></thead><tbody>${j.cards.map(x=>`<tr><td><strong>${esc(x.petName)}</strong><small>${esc(x.species)}</small></td><td>${esc(x.tutorName)}<small>${esc(x.tutorPhone)}</small></td><td>${esc(x.latestVaccine||'—')}</td><td>${x.nextDueDate?dateFmt.format(new Date(x.nextDueDate)):'—'}</td><td><a class="btn btn-small btn-ghost" href="/cartao/${x.publicToken}" target="_blank">Abrir cartão</a></td></tr>`).join('')}</tbody></table>`:'<div class="empty">Nenhum cartão cadastrado.</div>';
}catch(e){console.error(e)}}
if($('#vaccineForm'))$('#vaccineForm').addEventListener('submit',async e=>{e.preventDefault();const form=e.currentTarget,msg=form.querySelector('.form-message');msg.className='form-message';msg.textContent='Salvando...';try{await api('/api/admin/vaccinations',{method:'POST',body:JSON.stringify(fd(form))});msg.className='form-message success';msg.textContent='Vacinação registrada e cartão atualizado.';form.reset();await loadVaccines()}catch(err){msg.className='form-message error';msg.textContent=err.message}});

$('#dashClearBtn').addEventListener('click',()=>{$('#dashFrom').value='';$('#dashTo').value='';$('#dashService').value='';loadDashboard()});
