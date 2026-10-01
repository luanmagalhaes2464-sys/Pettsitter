const serviceEl=document.querySelector('#service'),visitsWrap=document.querySelector('#visitsWrap'),visitsEl=document.querySelector('#visits'),dateModeWrap=document.querySelector('#dateModeWrap'),dateModeEl=document.querySelector('#dateMode'),rangeDateFields=document.querySelector('#rangeDateFields'),specificDateFields=document.querySelector('#specificDateFields'),specificDateInput=document.querySelector('#specificDateInput'),specificDateList=document.querySelector('#specificDateList'),addSpecificDateBtn=document.querySelector('#addSpecificDate'),startDateEl=document.querySelector('#startDate'),endDateEl=document.querySelector('#endDate'),priceTotalEl=document.querySelector('#priceTotal'),priceDetailEl=document.querySelector('#priceDetail'),form=document.querySelector('#bookingForm'),formMessage=document.querySelector('#formMessage');
const money=new Intl.NumberFormat('pt-BR',{style:'currency',currency:'BRL'});
const dateFmt=new Intl.DateTimeFormat('pt-BR',{timeZone:'UTC'});
const countNames=['dogCount','catCount','birdCount','hamsterCount','guineaPigCount','fishCount','otherCount'];
const count=name=>Math.max(0,Number(form.elements[name]?.value||0));
let specificDates=[],specificSchedule=[];

function asDate(v){return v?new Date(v+'T12:00:00'):null}
function inclusiveDays(s,e){if(!s||!e)return 0;const ms=e-s;return ms<0?0:Math.floor(ms/86400000)+1}
function stayDays(s,e){if(!s||!e)return 0;const ms=e-s;return ms<0?0:Math.max(1,Math.ceil(ms/86400000))}
function scheduleVisits(date){return Math.max(1,Math.min(10,Number(specificSchedule.find(x=>x.date===date)?.visits||visitsEl.value||1)))}
function syncSpecificSchedule(){specificSchedule=specificDates.map(date=>({date,visits:scheduleVisits(date)}))}
function renderSpecificDates(){
  const withVisits=['pet_sitter','pet_sitter_passeio'].includes(serviceEl.value);
  syncSpecificSchedule();
  specificDateList.innerHTML=specificDates.length?specificDates.map(d=>`<div class="date-schedule-row" data-date="${d}"><strong>${dateFmt.format(new Date(d+'T12:00:00Z'))}</strong>${withVisits?`<label>Visitas <input class="specific-visit-input" data-date="${d}" type="number" min="1" max="10" value="${scheduleVisits(d)}"></label>`:''}<button type="button" class="date-remove" data-date="${d}" aria-label="Remover data">×</button></div>`).join(''):'<span class="muted">Nenhuma data adicionada.</span>'
}
function updateDateMode(){
  const supportsSpecific=['pet_sitter','pet_sitter_passeio','passeio'].includes(serviceEl.value);
  dateModeWrap.classList.toggle('hidden',!supportsSpecific);
  if(!supportsSpecific)dateModeEl.value='range';
  const specific=supportsSpecific&&dateModeEl.value==='specific';
  rangeDateFields.classList.toggle('hidden',specific);specificDateFields.classList.toggle('hidden',!specific);
  startDateEl.required=!specific;endDateEl.required=!specific;
  visitsWrap.classList.toggle('hidden',!['pet_sitter','pet_sitter_passeio'].includes(serviceEl.value)||specific);
}
function activeDays(){
  if(dateModeEl.value==='specific'&&['pet_sitter','pet_sitter_passeio','passeio'].includes(serviceEl.value))return specificDates.length;
  return inclusiveDays(asDate(startDateEl.value),asDate(endDateEl.value));
}
function calculate(){
  updateDateMode();
  const service=serviceEl.value,start=asDate(startDateEl.value),end=asDate(endDateEl.value),visits=Math.max(1,Number(visitsEl.value||1)),days=activeDays();
  const dogs=count('dogCount'),cats=count('catCount'),smallPets=count('birdCount')+count('hamsterCount')+count('guineaPigCount')+count('fishCount')+count('otherCount');
  let total=0,detail='Selecione serviço e datas',pending=false;
  visitsWrap.classList.toggle('hidden',!['pet_sitter','pet_sitter_passeio'].includes(service)||specific);
  const specific=dateModeEl.value==='specific'&&['pet_sitter','pet_sitter_passeio','passeio'].includes(service);
  if(!specific&&start&&end&&end<start)detail='A data final precisa ser igual ou posterior à inicial.';
  else if(specific&&!specificDates.length)detail='Adicione pelo menos uma data.';
  else if(service&&days>0){
    if(service==='pet_sitter'){const totalVisits=specific?specificSchedule.reduce((sum,x)=>sum+Number(x.visits||1),0):days*visits;total=totalVisits*35;detail=specific?totalVisits+' visita(s) distribuída(s) em '+days+' dia(s) × R$ 35':days+' dia(s) × '+visits+' visita(s)/dia × R$ 35 — sem acréscimo por quantidade de animais'}
    else if(service==='pet_sitter_passeio'){if(!dogs){pending=true;detail='Informe ao menos um cão para calcular o passeio.'}else{const rate=35+(15*dogs),totalVisits=specific?specificSchedule.reduce((sum,x)=>sum+Number(x.visits||1),0):days*visits;total=totalVisits*rate;detail=specific?totalVisits+' visita(s) em '+days+' dia(s) × (R$ 35 + R$ 15 × '+dogs+' cão(ães))':days+' dia(s) × '+visits+' visita(s)/dia × (R$ 35 + R$ 15 × '+dogs+' cão(ães))'}}
    else if(service==='passeio'){if(!dogs){pending=true;detail='Informe ao menos um cão para calcular o passeio.'}else{total=days*dogs*50;detail=days+' passeio(s) × '+dogs+' cão(ães) × R$ 50'}}
    else if(service==='hospedagem'&&start&&end){const d=stayDays(start,end),billable=dogs+cats,known=d*billable*65;if(smallPets||!billable){pending=true;detail=(billable?d+' diária(s) × '+billable+' cão/gato × R$ 65 = '+money.format(known)+'; ':'')+'demais animais: valor a validar'}else{total=known;detail=d+' diária(s) × '+billable+' cão/gato × R$ 65'}}
    else if(service==='vacinacao'){pending=true;detail='Valor definido após avaliação do protocolo e da vacina indicada.'}
  }
  priceTotalEl.textContent=pending?'A validar':money.format(total);
  priceDetailEl.textContent=detail;
  return{total,pending,detail};
}

const today=new Date(),minDate=today.getFullYear()+'-'+String(today.getMonth()+1).padStart(2,'0')+'-'+String(today.getDate()).padStart(2,'0');
startDateEl.min=minDate;endDateEl.min=minDate;specificDateInput.min=minDate;
startDateEl.addEventListener('change',()=>{endDateEl.min=startDateEl.value||minDate;if(!endDateEl.value)endDateEl.value=startDateEl.value;calculate()});
dateModeEl.addEventListener('change',()=>{renderSpecificDates();calculate()});
addSpecificDateBtn.addEventListener('click',()=>{const value=specificDateInput.value;if(!value)return;if(!specificDates.includes(value)){specificDates.push(value);specificSchedule.push({date:value,visits:Math.max(1,Number(visitsEl.value||1))})}specificDates.sort();specificDateInput.value='';renderSpecificDates();calculate()});
specificDateList.addEventListener('click',e=>{const btn=e.target.closest('.date-remove');if(!btn)return;specificDates=specificDates.filter(x=>x!==btn.dataset.date);specificSchedule=specificSchedule.filter(x=>x.date!==btn.dataset.date);renderSpecificDates();calculate()});
specificDateList.addEventListener('input',e=>{if(!e.target.classList.contains('specific-visit-input'))return;const item=specificSchedule.find(x=>x.date===e.target.dataset.date);if(item)item.visits=Math.max(1,Math.min(10,Number(e.target.value||1)));calculate()});
[visitsEl,endDateEl,...countNames.map(name=>form.elements[name])].forEach(el=>el?.addEventListener('input',calculate));
serviceEl.addEventListener('change',()=>{renderSpecificDates();calculate()});

async function sendBooking(data){let lastErr;for(let attempt=0;attempt<2;attempt++){try{const r=await fetch('/api/bookings',{method:'POST',headers:{'Content-Type':'application/json','Accept':'application/json'},body:JSON.stringify(data)});const raw=await r.text();let result=null;try{result=raw?JSON.parse(raw):{}}catch{if([502,503,504].includes(r.status)||raw.trim().startsWith('<!DOCTYPE')||raw.trim().startsWith('<html')){lastErr=new Error('O sistema está reiniciando no Render. Aguarde alguns segundos e tente novamente.');if(attempt===0){await new Promise(resolve=>setTimeout(resolve,3500));continue}}throw new Error('O servidor respondeu de forma inesperada. Atualize a página e tente novamente.')}if(!r.ok)throw new Error(result.error||'Falha no envio');return result}catch(err){lastErr=err;if(attempt===0&&/reiniciando|Failed to fetch|NetworkError/i.test(String(err.message))){await new Promise(resolve=>setTimeout(resolve,3500));continue}break}}throw lastErr||new Error('Não foi possível enviar agora.')}

let submitting=false,requestId=crypto.randomUUID();
form.addEventListener('submit',async e=>{
  e.preventDefault();if(submitting)return;
  const totalAnimals=countNames.reduce((sum,name)=>sum+count(name),0),dogs=count('dogCount'),supportsSpecific=['pet_sitter','pet_sitter_passeio','passeio'].includes(serviceEl.value),specific=supportsSpecific&&dateModeEl.value==='specific';
  if(totalAnimals<1){formMessage.className='form-message error';formMessage.textContent='Informe pelo menos um animal.';return}
  if(['passeio','pet_sitter_passeio'].includes(serviceEl.value)&&dogs<1){formMessage.className='form-message error';formMessage.textContent='Para passeio, informe pelo menos um cão.';return}
  if(specific&&!specificDates.length){formMessage.className='form-message error';formMessage.textContent='Adicione pelo menos uma data de atendimento.';return}
  submitting=true;const submitButton=form.querySelector('[type=submit]');submitButton.disabled=true;submitButton.textContent='Enviando...';formMessage.className='form-message';formMessage.textContent='Enviando...';
  const waWindow=window.open('about:blank','_blank'),data=Object.fromEntries(new FormData(form).entries());
  data.requestId=requestId;data.visits=Number(data.visits||1);countNames.forEach(name=>data[name]=Number(data[name]||0));
  data.dateMode=specific?'specific':'range';data.specificDates=specific?[...specificDates]:[];data.specificSchedule=specific?specificSchedule.map(x=>({date:x.date,visits:Math.max(1,Math.min(10,Number(x.visits||1)))})):[];
  if(specific){data.startDate=specificDates[0];data.endDate=specificDates[specificDates.length-1]}
  try{const result=await sendBooking(data);formMessage.className='form-message success';formMessage.innerHTML='Pré-solicitação <strong>'+result.id.slice(0,8)+'</strong> registrada com sucesso. Vamos abrir seu WhatsApp com a mensagem pronta para a Isabela. Basta tocar em <strong>Enviar</strong>.';if(result.customerWhatsAppUrl){if(waWindow){waWindow.location.href=result.customerWhatsAppUrl}else{const link=document.createElement('a');link.href=result.customerWhatsAppUrl;link.target='_blank';link.rel='noreferrer';link.textContent=' Abrir WhatsApp para enviar a mensagem';formMessage.appendChild(link)}}else if(waWindow){waWindow.close()}requestId=crypto.randomUUID();form.reset();specificDates=[];specificSchedule=[];renderSpecificDates();calculate()}
  catch(err){if(waWindow)waWindow.close();formMessage.className='form-message error';formMessage.textContent=err.message||'Não foi possível enviar agora.'}
  finally{submitting=false;submitButton.disabled=false;submitButton.textContent='Confirmar pré-solicitação'}
});
renderSpecificDates();calculate();
