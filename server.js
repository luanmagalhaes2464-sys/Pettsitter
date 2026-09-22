import 'dotenv/config';
import crypto from 'node:crypto';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import express from 'express';
import helmet from 'helmet';
import rateLimit from 'express-rate-limit';
import session from 'express-session';
import connectPgSimple from 'connect-pg-simple';
import bcrypt from 'bcryptjs';
import pg from 'pg';
import { z } from 'zod';
import { google } from 'googleapis';
import nodemailer from 'nodemailer';

const { Pool } = pg;
const __dirname = path.dirname(fileURLToPath(import.meta.url));
const app = express();
const PORT = Number(process.env.PORT || 3000);
const PROD = process.env.NODE_ENV === 'production';
const DB = process.env.DATABASE_URL || '';
const pool = new Pool({ connectionString: DB || undefined, ssl: DB && !DB.includes('localhost') ? { rejectUnauthorized: false } : undefined, max: 10 });

app.set('trust proxy', 1);
app.use(helmet({ contentSecurityPolicy: { directives: { defaultSrc:["'self'"], scriptSrc:["'self'"], styleSrc:["'self'"], imgSrc:["'self'",'data:'], connectSrc:["'self'"], objectSrc:["'none'"], frameAncestors:["'none'"] } } }));
app.use(express.json({ limit: '80kb' }));
app.use(express.urlencoded({ extended: false, limit: '80kb' }));
const PgStore = connectPgSimple(session);
const SESSION_SECRET = process.env.SESSION_SECRET || crypto.createHash('sha256').update('casal-pet-sitter-session:'+DB).digest('hex');
app.use(session({ store: DB ? new PgStore({ pool, tableName:'cps_session', createTableIfMissing:true }) : undefined, secret:SESSION_SECRET, resave:false, saveUninitialized:false, name:'cps.sid', cookie:{ httpOnly:true, secure:PROD, sameSite:'lax', maxAge:12*60*60*1000 } }));
app.use(express.static(path.join(__dirname,'public'), { maxAge: 0, etag: true }));

const OWNER_WHATSAPP = process.env.OWNER_WHATSAPP || '5532999108979';
const WIFE_WHATSAPP = process.env.WIFE_WHATSAPP || '5531996377552';
const OWNER_EMAIL = process.env.OWNER_EMAIL || 'luanmagalhaes2464@gmail.com';
const WIFE_EMAIL = process.env.WIFE_EMAIL || 'belaisapr@gmail.com';
const SERVICE = { pet_sitter:'Pet sitter', pet_sitter_passeio:'Pet sitter + passeio', passeio:'Passeio', hospedagem:'Hospedagem', vacinacao:'Vacinação' };
const STATUS = { new:'Nova', analyzing:'Em análise', confirmed:'Confirmada', completed:'Concluída', cancelled:'Cancelada' };
const STATUS_KEYS = Object.keys(STATUS);
const money = n => new Intl.NumberFormat('pt-BR',{style:'currency',currency:'BRL'}).format(Number(n||0));
const phone = v => String(v||'').replace(/\D/g,'');
const waPhone = v => { const p=phone(v); return p.startsWith('55')?p:(p.length===10||p.length===11?'55'+p:p); };
const dateBr = v => { const s=String(v||'').slice(0,10).split('-'); return s.length===3?s.reverse().join('/'):String(v||''); };
const text = (v,n=500) => String(v||'').trim().slice(0,n);
const d = v => new Date(String(v)+'T12:00:00-03:00');
const daysInclusive = (a,b) => Math.max(0,Math.floor((d(b)-d(a))/86400000)+1);
const stayDays = (a,b) => Math.max(1,Math.ceil((d(b)-d(a))/86400000));

function calc(service,start,end,visits){
  const n = Math.max(1,Math.min(10,Number(visits||1)));
  const days = daysInclusive(start,end);
  if (!days) throw new Error('Período inválido.');
  if (service==='pet_sitter') return { total:days*n*35, detail:days+' dia(s) × '+n+' visita(s)/dia × R$ 35' };
  if (service==='pet_sitter_passeio') return { total:days*n*50, detail:days+' dia(s) × '+n+' visita(s)/dia × (R$ 35 + R$ 15)' };
  if (service==='passeio') return { total:days*50, detail:days+' passeio(s) de 30 min × R$ 50' };
  if (service==='hospedagem') { const q=stayDays(start,end), rate=q>5?65:70; return { total:q*rate, detail:q+' diária(s) × '+money(rate) }; }
  if (service==='vacinacao') return { total:null, detail:'Valor definido após avaliação do protocolo e da vacina indicada.' };
  throw new Error('Serviço inválido.');
}

async function initDb(){
  if(!DB) return;
  await pool.query('CREATE TABLE IF NOT EXISTS cps_users(id BIGSERIAL PRIMARY KEY,name VARCHAR(120) NOT NULL,email VARCHAR(200) UNIQUE NOT NULL,password_hash TEXT NOT NULL,role VARCHAR(30) NOT NULL DEFAULT \'admin\',active BOOLEAN NOT NULL DEFAULT TRUE,created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW())');
  await pool.query('CREATE TABLE IF NOT EXISTS cps_bookings(id UUID PRIMARY KEY,service VARCHAR(60) NOT NULL,start_date DATE NOT NULL,end_date DATE NOT NULL,visits INTEGER NOT NULL DEFAULT 1,tutor_name VARCHAR(140) NOT NULL,phone VARCHAR(40) NOT NULL,street VARCHAR(220) NOT NULL,neighborhood VARCHAR(140) NOT NULL,animal_count INTEGER NOT NULL DEFAULT 1,animals VARCHAR(300) NOT NULL,notes TEXT,estimated_total NUMERIC(12,2),price_detail VARCHAR(300),status VARCHAR(30) NOT NULL DEFAULT \'new\',calendar_event_id VARCHAR(255),whatsapp_sent BOOLEAN NOT NULL DEFAULT FALSE,source VARCHAR(40) NOT NULL DEFAULT \'site\',created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW())');
  await pool.query('ALTER TABLE cps_bookings ADD COLUMN IF NOT EXISTS email_sent BOOLEAN NOT NULL DEFAULT FALSE');
  await pool.query('CREATE INDEX IF NOT EXISTS cps_bookings_dates_idx ON cps_bookings(start_date,end_date); CREATE INDEX IF NOT EXISTS cps_bookings_status_idx ON cps_bookings(status); CREATE INDEX IF NOT EXISTS cps_bookings_phone_idx ON cps_bookings(phone)');
  await pool.query('CREATE TABLE IF NOT EXISTS cps_payments(id UUID PRIMARY KEY,booking_id UUID REFERENCES cps_bookings(id) ON DELETE SET NULL,amount NUMERIC(12,2) NOT NULL CHECK(amount>=0),method VARCHAR(40) NOT NULL DEFAULT \'pix\',paid_at DATE NOT NULL DEFAULT CURRENT_DATE,note VARCHAR(300),created_by BIGINT REFERENCES cps_users(id) ON DELETE SET NULL,created_at TIMESTAMPTZ NOT NULL DEFAULT NOW())');
  await pool.query('CREATE TABLE IF NOT EXISTS cps_expenses(id UUID PRIMARY KEY,amount NUMERIC(12,2) NOT NULL CHECK(amount>=0),category VARCHAR(100) NOT NULL,occurred_at DATE NOT NULL DEFAULT CURRENT_DATE,note VARCHAR(300),created_by BIGINT REFERENCES cps_users(id) ON DELETE SET NULL,created_at TIMESTAMPTZ NOT NULL DEFAULT NOW())');
  await pool.query('CREATE TABLE IF NOT EXISTS cps_audit_log(id BIGSERIAL PRIMARY KEY,user_id BIGINT REFERENCES cps_users(id) ON DELETE SET NULL,action VARCHAR(100) NOT NULL,entity_type VARCHAR(60),entity_id VARCHAR(100),metadata JSONB,created_at TIMESTAMPTZ NOT NULL DEFAULT NOW())');
  await seed(process.env.ADMIN_EMAIL,process.env.ADMIN_PASSWORD,process.env.ADMIN_NAME||'Luan');
  await seed(process.env.SECOND_ADMIN_EMAIL,process.env.SECOND_ADMIN_PASSWORD,process.env.SECOND_ADMIN_NAME||'Isabela');
}
async function seed(email,password,name){ if(!email||!password)return; const e=email.trim().toLowerCase(); const found=await pool.query('SELECT id FROM cps_users WHERE email=$1',[e]); if(found.rowCount)return; const hash=await bcrypt.hash(password,12); await pool.query('INSERT INTO cps_users(name,email,password_hash,role) VALUES($1,$2,$3,\'admin\')',[name,e,hash]); }

function bookingMsg(b){
  const tutorChat='https://wa.me/'+waPhone(b.phone);
  return ['🐾 Nova pré-solicitação — Casal Pet Sitter','Código: '+b.id,'Serviço: '+SERVICE[b.service],'Período: '+dateBr(b.startDate)+' a '+dateBr(b.endDate),['pet_sitter','pet_sitter_passeio'].includes(b.service)?'Visitas por dia: '+b.visits:null,'Tutor: '+b.tutorName,'Telefone: '+b.phone,'Falar com o tutor: '+tutorChat,'Endereço: '+b.street+' — '+b.neighborhood+', Viçosa/MG','Animais: '+b.animalCount+' ('+b.animals+')','Observações: '+(b.notes||'Não informado'),'Estimativa: '+(b.estimatedTotal==null?'A confirmar':money(b.estimatedTotal)),'Cálculo: '+b.priceDetail,'Status: aguardando confirmação de disponibilidade.'].filter(Boolean).join('\n');
}
function customerBookingMsg(b){
  return ['Olá! 🐾 Fiz uma pré-reserva pelo site do Casal Pet Sitter.','Código: '+b.id.slice(0,8),'Nome: '+b.tutorName,'Serviço: '+SERVICE[b.service],'Período: '+dateBr(b.startDate)+' a '+dateBr(b.endDate),['pet_sitter','pet_sitter_passeio'].includes(b.service)?'Visitas por dia: '+b.visits:null,'Telefone informado: '+b.phone,'Endereço: '+b.street+' — '+b.neighborhood+', Viçosa/MG','Animais: '+b.animalCount+' ('+b.animals+')','Observações: '+(b.notes||'Não informado'),'Estimativa: '+(b.estimatedTotal==null?'A confirmar':money(b.estimatedTotal)),'Gostaria de confirmar a disponibilidade.'].filter(Boolean).join('\n');
}

async function sendBookingEmail(b){
  const host=process.env.SMTP_HOST, user=process.env.SMTP_USER, pass=process.env.SMTP_PASS;
  if(!host||!user||!pass) return false;
  const port=Number(process.env.SMTP_PORT||465);
  const secure=String(process.env.SMTP_SECURE??'true').toLowerCase()==='true';
  const transporter=nodemailer.createTransport({host,port,secure,auth:{user,pass}});
  const subject='🐾 Nova pré-reserva • '+SERVICE[b.service]+' • '+b.tutorName+' • '+dateBr(b.startDate);
  const tutorUrl='https://wa.me/'+waPhone(b.phone);
  const panelUrl=process.env.APP_BASE_URL||'https://casal-pet-sitter.onrender.com';
  const html=`<div style="font-family:Arial,sans-serif;color:#3c3026;line-height:1.55">
    <h2>🐾 Nova pré-reserva — Casal Pet Sitter</h2>
    <p><strong>Serviço:</strong> ${SERVICE[b.service]}</p>
    <p><strong>Período:</strong> ${dateBr(b.startDate)} a ${dateBr(b.endDate)}</p>
    <p><strong>Tutor:</strong> ${b.tutorName}<br><strong>Telefone:</strong> ${b.phone}</p>
    <p><a href="${tutorUrl}">Conversar com o tutor pelo WhatsApp</a></p>
    <p><strong>Endereço:</strong> ${b.street} — ${b.neighborhood}, Viçosa/MG</p>
    <p><strong>Animais:</strong> ${b.animalCount} (${b.animals})</p>
    <p><strong>Observações:</strong> ${b.notes||'Não informado'}</p>
    <p><strong>Estimativa:</strong> ${b.estimatedTotal==null?'A confirmar':money(b.estimatedTotal)}</p>
    <p><strong>Status:</strong> aguardando confirmação.</p>
    <p><a href="${panelUrl}/login">Abrir painel administrativo para confirmar ou recusar</a></p>
    <hr><p style="color:#74685c;font-size:13px">A pré-reserva só entra na agenda depois que vocês alterarem o status para Confirmada.</p>
  </div>`;
  await transporter.sendMail({
    from:process.env.EMAIL_FROM||('Casal Pet Sitter <'+user+'>'),
    to:[OWNER_EMAIL,WIFE_EMAIL].join(','),
    subject,
    text:bookingMsg(b)+'\n\nAbra o painel para confirmar: '+panelUrl+'/login',
    html
  });
  return true;
}
async function createCalendar(b){
  const client=process.env.GOOGLE_SERVICE_ACCOUNT_EMAIL, key=(process.env.GOOGLE_PRIVATE_KEY||'').replace(/\\n/g,'\n'), calendarId=process.env.GOOGLE_CALENDAR_ID;
  if(!client||!key||!calendarId) return null;
  const auth=new google.auth.JWT({email:client,key,scopes:['https://www.googleapis.com/auth/calendar']});
  const api=google.calendar({version:'v3',auth});
  const start=new Date(b.startDate+'T09:00:00-03:00'), end=new Date(b.endDate+'T18:00:00-03:00'); if(end<=start)end.setHours(start.getHours()+1);
  const r=await api.events.insert({calendarId,sendUpdates:'all',requestBody:{summary:'Pré-solicitação • '+SERVICE[b.service]+' • '+b.tutorName,location:b.street+', '+b.neighborhood+', Viçosa - MG',description:bookingMsg(b),start:{dateTime:start.toISOString(),timeZone:'America/Sao_Paulo'},end:{dateTime:end.toISOString(),timeZone:'America/Sao_Paulo'},attendees:[{email:OWNER_EMAIL},{email:WIFE_EMAIL}]}});
  return r.data.id||null;
}

const bookingSchema=z.object({service:z.enum(['pet_sitter','pet_sitter_passeio','passeio','hospedagem','vacinacao']),startDate:z.string().regex(/^\d{4}-\d{2}-\d{2}$/),endDate:z.string().regex(/^\d{4}-\d{2}-\d{2}$/),visits:z.coerce.number().int().min(1).max(10).default(1),tutorName:z.string().trim().min(2).max(140),phone:z.string().trim().min(8).max(40),street:z.string().trim().min(3).max(220),neighborhood:z.string().trim().min(2).max(140),animalCount:z.coerce.number().int().min(1).max(30),animals:z.string().trim().min(2).max(300),notes:z.string().trim().max(1200).optional().default('')});
const bookingLimiter=rateLimit({windowMs:10*60*1000,limit:20,standardHeaders:true,legacyHeaders:false});
const loginLimiter=rateLimit({windowMs:15*60*1000,limit:10,standardHeaders:true,legacyHeaders:false,skipSuccessfulRequests:true});
function needDb(req,res,next){ if(!DB)return res.status(503).json({error:'Banco de dados não configurado.'}); next(); }
function needAuth(req,res,next){ if(!req.session.userId)return res.status(401).json({error:'Não autenticado.'}); next(); }
function csrf(req){ if(!req.session.csrfToken)req.session.csrfToken=crypto.randomBytes(24).toString('hex'); return req.session.csrfToken; }
function needCsrf(req,res,next){ if(!req.get('x-csrf-token')||req.get('x-csrf-token')!==req.session.csrfToken)return res.status(403).json({error:'Sessão expirada. Atualize a página.'}); next(); }
async function audit(req,action,type,id,metadata={}){ if(!DB)return; try{await pool.query('INSERT INTO cps_audit_log(user_id,action,entity_type,entity_id,metadata) VALUES($1,$2,$3,$4,$5)',[req.session.userId||null,action,type,id?String(id):null,metadata]);}catch(e){console.error('audit',e.message);} }
function mapBooking(r){ return {id:r.id,service:r.service,serviceLabel:SERVICE[r.service]||r.service,startDate:r.start_date,endDate:r.end_date,visits:r.visits,tutorName:r.tutor_name,phone:r.phone,street:r.street,neighborhood:r.neighborhood,animalCount:r.animal_count,animals:r.animals,notes:r.notes,estimatedTotal:r.estimated_total==null?null:Number(r.estimated_total),priceDetail:r.price_detail,status:r.status,statusLabel:STATUS[r.status]||r.status,whatsappSent:r.whatsapp_sent,createdAt:r.created_at}; }

app.get('/api/health',async(_req,res)=>{let db=false;if(DB){try{await pool.query('SELECT 1');db=true}catch{}}res.json({ok:true,db,version:'2.1.0'})});
app.post('/api/bookings',bookingLimiter,needDb,async(req,res)=>{try{
  const p=bookingSchema.parse(req.body);
  const today=new Date();today.setHours(0,0,0,0);
  if(d(p.startDate)<today||d(p.endDate)<d(p.startDate))return res.status(400).json({error:'Confira as datas informadas.'});
  const price=calc(p.service,p.startDate,p.endDate,p.visits),id=crypto.randomUUID(),b={...p,id,estimatedTotal:price.total,priceDetail:price.detail};
  await pool.query('INSERT INTO cps_bookings(id,service,start_date,end_date,visits,tutor_name,phone,street,neighborhood,animal_count,animals,notes,estimated_total,price_detail) VALUES($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14)',[id,p.service,p.startDate,p.endDate,p.visits,p.tutorName,p.phone,p.street,p.neighborhood,p.animalCount,p.animals,p.notes,price.total,price.detail]);
  let emailSent=false;
  try{emailSent=await sendBookingEmail(b)}catch(e){console.error('Email:',e.message)}
  await pool.query('UPDATE cps_bookings SET email_sent=$1,updated_at=NOW() WHERE id=$2',[emailSent,id]);
  const customerWhatsAppUrl='https://wa.me/'+WIFE_WHATSAPP+'?text='+encodeURIComponent(customerBookingMsg(b));res.status(201).json({ok:true,id,total:price.total,priceDetail:price.detail,emailSent,customerWhatsAppUrl});
}catch(e){
  if(e instanceof z.ZodError){const field=e.issues?.[0]?.path?.[0];const messages={service:'Selecione o serviço.',startDate:'Informe a data inicial.',endDate:'Informe a data final.',visits:'Confira a quantidade de visitas por dia.',tutorName:'Informe o nome completo do tutor.',phone:'Informe um telefone/WhatsApp válido.',street:'Informe a rua e o número.',neighborhood:'Informe o bairro.',animalCount:'Informe a quantidade de animais.',animals:'Informe quais são os animais, por exemplo: "1 cão", "2 gatos" ou "Thor (cão)".',notes:'Confira as observações.'};return res.status(400).json({error:messages[field]||'Confira os dados informados.',field});}
  console.error(e);res.status(500).json({error:'Não foi possível salvar a solicitação agora.'});
}});

app.post('/api/setup',needDb,async(req,res)=>{try{
  const configured=await pool.query('SELECT COUNT(*)::int AS n FROM cps_users WHERE active=TRUE');
  if(Number(configured.rows[0].n)>0)return res.status(409).json({error:'A configuração inicial já foi concluída.'});
  const token=String(req.body.setupToken||'');
  if(!process.env.SETUP_TOKEN||token!==process.env.SETUP_TOKEN)return res.status(403).json({error:'Código de configuração inválido.'});
  const lp=String(req.body.luanPassword||''),ip=String(req.body.isabelaPassword||'');
  if(lp.length<10||ip.length<10)return res.status(400).json({error:'Use senhas com pelo menos 10 caracteres.'});
  const lhash=await bcrypt.hash(lp,12),ihash=await bcrypt.hash(ip,12);
  const client=await pool.connect();
  try{
    await client.query('BEGIN');
    await client.query("INSERT INTO cps_users(name,email,password_hash,role) VALUES('Luan',$1,$2,'admin')",[process.env.ADMIN_EMAIL||'luanmagalhaes2464@gmail.com',lhash]);
    await client.query("INSERT INTO cps_users(name,email,password_hash,role) VALUES('Isabela',$1,$2,'admin')",[process.env.SECOND_ADMIN_EMAIL||'belaisapr@gmail.com',ihash]);
    await client.query('COMMIT');
  }catch(e){await client.query('ROLLBACK');throw e}finally{client.release()}
  res.status(201).json({ok:true});
}catch(e){console.error(e);res.status(500).json({error:'Não foi possível criar os acessos.'})}});

app.post('/api/auth/login',loginLimiter,needDb,async(req,res)=>{const email=text(req.body.email,200).toLowerCase(),password=String(req.body.password||'').slice(0,300);if(!email||!password)return res.status(400).json({error:'Informe e-mail e senha.'});const q=await pool.query('SELECT id,name,email,password_hash,role,active FROM cps_users WHERE email=$1',[email]),u=q.rows[0];if(!u||!u.active||!(await bcrypt.compare(password,u.password_hash)))return res.status(401).json({error:'E-mail ou senha inválidos.'});req.session.regenerate(err=>{if(err)return res.status(500).json({error:'Falha ao iniciar sessão.'});req.session.userId=u.id;req.session.csrfToken=crypto.randomBytes(24).toString('hex');res.json({ok:true,user:{id:u.id,name:u.name,email:u.email,role:u.role},csrfToken:req.session.csrfToken});});});
app.get('/api/auth/me',needAuth,needDb,async(req,res)=>{const q=await pool.query('SELECT id,name,email,role FROM cps_users WHERE id=$1 AND active=TRUE',[req.session.userId]);if(!q.rowCount)return req.session.destroy(()=>res.status(401).json({error:'Sessão inválida.'}));res.json({user:q.rows[0],csrfToken:csrf(req)});});
app.post('/api/auth/logout',needAuth,needCsrf,(req,res)=>req.session.destroy(()=>{res.clearCookie('cps.sid');res.json({ok:true})}));
app.post('/api/auth/change-password',needAuth,needCsrf,needDb,async(req,res)=>{const current=String(req.body.currentPassword||''),next=String(req.body.newPassword||'');if(next.length<10)return res.status(400).json({error:'A nova senha deve ter pelo menos 10 caracteres.'});const q=await pool.query('SELECT password_hash FROM cps_users WHERE id=$1',[req.session.userId]);if(!q.rowCount||!(await bcrypt.compare(current,q.rows[0].password_hash)))return res.status(400).json({error:'Senha atual incorreta.'});await pool.query('UPDATE cps_users SET password_hash=$1,updated_at=NOW() WHERE id=$2',[await bcrypt.hash(next,12),req.session.userId]);await audit(req,'change_password','user',req.session.userId);res.json({ok:true});});

app.get('/api/admin/dashboard',needAuth,needDb,async(req,res)=>{try{
  const validDate=v=>/^\d{4}-\d{2}-\d{2}$/.test(String(v||''))?String(v):null;
  const from=validDate(req.query.from),to=validDate(req.query.to);
  const service=SERVICE[req.query.service]?String(req.query.service):null;
  const args=[from,to,service];
  const summarySql=`
    SELECT
      COALESCE((SELECT SUM(p.amount) FROM cps_payments p LEFT JOIN cps_bookings b ON b.id=p.booking_id
        WHERE ($1::date IS NULL OR p.paid_at >= $1::date) AND ($2::date IS NULL OR p.paid_at <= $2::date)
        AND ($3::text IS NULL OR b.service=$3::text)),0) received,
      COALESCE((SELECT SUM(e.amount) FROM cps_expenses e
        WHERE ($1::date IS NULL OR e.occurred_at >= $1::date) AND ($2::date IS NULL OR e.occurred_at <= $2::date)),0) expenses,
      COALESCE((SELECT SUM(b.estimated_total) FROM cps_bookings b
        WHERE b.status IN ('confirmed','completed') AND ($1::date IS NULL OR b.start_date >= $1::date)
        AND ($2::date IS NULL OR b.start_date <= $2::date) AND ($3::text IS NULL OR b.service=$3::text)),0) contracted,
      (SELECT COUNT(*) FROM cps_bookings b
        WHERE ($1::date IS NULL OR b.start_date >= $1::date) AND ($2::date IS NULL OR b.start_date <= $2::date)
        AND ($3::text IS NULL OR b.service=$3::text)) bookings,
      (SELECT COUNT(DISTINCT b.phone) FROM cps_bookings b
        WHERE ($1::date IS NULL OR b.start_date >= $1::date) AND ($2::date IS NULL OR b.start_date <= $2::date)
        AND ($3::text IS NULL OR b.service=$3::text)) clients`;
  const monthSql=`
    WITH bounds AS (
      SELECT COALESCE($1::date,date_trunc('month',CURRENT_DATE)-interval '5 months')::date f,
             COALESCE($2::date,CURRENT_DATE)::date t
    ), months AS (
      SELECT generate_series(date_trunc('month',f),date_trunc('month',t),interval '1 month') month FROM bounds
    ), pay AS (
      SELECT date_trunc('month',p.paid_at) m,SUM(p.amount) received
      FROM cps_payments p LEFT JOIN cps_bookings b ON b.id=p.booking_id,bounds
      WHERE p.paid_at BETWEEN bounds.f AND bounds.t AND ($3::text IS NULL OR b.service=$3::text)
      GROUP BY 1
    ), exp AS (
      SELECT date_trunc('month',e.occurred_at) m,SUM(e.amount) expenses
      FROM cps_expenses e,bounds WHERE e.occurred_at BETWEEN bounds.f AND bounds.t GROUP BY 1
    )
    SELECT TO_CHAR(month,'YYYY-MM') month,COALESCE(pay.received,0) received,COALESCE(exp.expenses,0) expenses
    FROM months LEFT JOIN pay ON pay.m=month LEFT JOIN exp ON exp.m=month ORDER BY month`;
  const bookingCountSql=`
    SELECT service,COUNT(*) bookings FROM cps_bookings b
    WHERE ($1::date IS NULL OR b.start_date >= $1::date) AND ($2::date IS NULL OR b.start_date <= $2::date)
      AND ($3::text IS NULL OR b.service=$3::text)
    GROUP BY service`;
  const revenueSql=`
    SELECT COALESCE(b.service,'unlinked') service,COALESCE(SUM(p.amount),0) received
    FROM cps_payments p LEFT JOIN cps_bookings b ON b.id=p.booking_id
    WHERE ($1::date IS NULL OR p.paid_at >= $1::date) AND ($2::date IS NULL OR p.paid_at <= $2::date)
      AND ($3::text IS NULL OR b.service=$3::text)
    GROUP BY COALESCE(b.service,'unlinked')`;
  const recentSql=`
    SELECT * FROM cps_bookings b
    WHERE ($1::date IS NULL OR b.start_date >= $1::date) AND ($2::date IS NULL OR b.start_date <= $2::date)
      AND ($3::text IS NULL OR b.service=$3::text)
    ORDER BY created_at DESC LIMIT 12`;
  const [s,m,bc,rv,r]=await Promise.all([
    pool.query(summarySql,args),pool.query(monthSql,args),pool.query(bookingCountSql,args),pool.query(revenueSql,args),pool.query(recentSql,args)
  ]);
  const x=s.rows[0], counts=new Map(bc.rows.map(v=>[v.service,Number(v.bookings)])), revenues=new Map(rv.rows.map(v=>[v.service,Number(v.received)]));
  const keys=new Set([...counts.keys(),...revenues.keys()]);
  const byService=[...keys].filter(k=>k!=='unlinked').map(k=>({service:k,serviceLabel:SERVICE[k]||k,bookings:counts.get(k)||0,received:revenues.get(k)||0})).sort((a,b)=>b.received-a.received);
  if(revenues.has('unlinked'))byService.push({service:'unlinked',serviceLabel:'Recebimento sem vínculo',bookings:0,received:revenues.get('unlinked')||0});
  res.json({filter:{from,to,service},summary:{received:Number(x.received),expenses:Number(x.expenses),net:Number(x.received)-Number(x.expenses),contracted:Number(x.contracted),bookings:Number(x.bookings),clients:Number(x.clients)},monthly:m.rows.map(v=>({month:v.month,received:Number(v.received),expenses:Number(v.expenses)})),byService,recent:r.rows.map(mapBooking)});
}catch(e){console.error(e);res.status(500).json({error:'Não foi possível carregar o dashboard.'})}});
app.get('/api/admin/bookings',needAuth,needDb,async(req,res)=>{const st=text(req.query.status,30),search=text(req.query.search,100),params=[],where=[];if(st&&STATUS_KEYS.includes(st)){params.push(st);where.push('status=$'+params.length)}if(search){params.push('%'+search+'%');where.push('(tutor_name ILIKE $'+params.length+' OR phone ILIKE $'+params.length+' OR animals ILIKE $'+params.length+')')}const q=await pool.query('SELECT * FROM cps_bookings '+(where.length?'WHERE '+where.join(' AND '):'')+' ORDER BY start_date DESC,created_at DESC LIMIT 500',params);res.json({bookings:q.rows.map(mapBooking)});});
app.patch('/api/admin/bookings/:id',needAuth,needCsrf,needDb,async(req,res)=>{const st=text(req.body.status,30);if(!STATUS_KEYS.includes(st))return res.status(400).json({error:'Status inválido.'});const q=await pool.query('UPDATE cps_bookings SET status=$1,updated_at=NOW() WHERE id=$2 RETURNING *',[st,req.params.id]);if(!q.rowCount)return res.status(404).json({error:'Agendamento não encontrado.'});let row=q.rows[0];if(st==='confirmed'&&!row.calendar_event_id){try{const b=mapBooking(row),calendarEventId=await createCalendar({id:b.id,service:b.service,startDate:String(b.startDate).slice(0,10),endDate:String(b.endDate).slice(0,10),visits:b.visits,tutorName:b.tutorName,phone:b.phone,street:b.street,neighborhood:b.neighborhood,animalCount:b.animalCount,animals:b.animals,notes:b.notes,estimatedTotal:b.estimatedTotal,priceDetail:b.priceDetail});if(calendarEventId){const uq=await pool.query('UPDATE cps_bookings SET calendar_event_id=$1,updated_at=NOW() WHERE id=$2 RETURNING *',[calendarEventId,req.params.id]);row=uq.rows[0]}}catch(e){console.error('Calendar confirmation:',e.message)}}await audit(req,'update_booking_status','booking',req.params.id,{status:st});res.json({booking:mapBooking(row)});});
app.post('/api/admin/payments',needAuth,needCsrf,needDb,async(req,res)=>{const schema=z.object({bookingId:z.string().uuid().optional().or(z.literal('')),amount:z.coerce.number().positive().max(100000),method:z.enum(['pix','dinheiro','cartao','transferencia','outro']),paidAt:z.string().regex(/^\d{4}-\d{2}-\d{2}$/),note:z.string().trim().max(300).optional().default('')});try{const p=schema.parse(req.body),id=crypto.randomUUID();await pool.query('INSERT INTO cps_payments(id,booking_id,amount,method,paid_at,note,created_by) VALUES($1,$2,$3,$4,$5,$6,$7)',[id,p.bookingId||null,p.amount,p.method,p.paidAt,p.note,req.session.userId]);await audit(req,'create_payment','payment',id,{amount:p.amount});res.status(201).json({ok:true,id});}catch(e){if(e instanceof z.ZodError)return res.status(400).json({error:'Confira os dados do recebimento.'});throw e}});
app.post('/api/admin/expenses',needAuth,needCsrf,needDb,async(req,res)=>{const schema=z.object({amount:z.coerce.number().positive().max(100000),category:z.string().trim().min(2).max(100),occurredAt:z.string().regex(/^\d{4}-\d{2}-\d{2}$/),note:z.string().trim().max(300).optional().default('')});try{const p=schema.parse(req.body),id=crypto.randomUUID();await pool.query('INSERT INTO cps_expenses(id,amount,category,occurred_at,note,created_by) VALUES($1,$2,$3,$4,$5,$6)',[id,p.amount,p.category,p.occurredAt,p.note,req.session.userId]);await audit(req,'create_expense','expense',id,{amount:p.amount,category:p.category});res.status(201).json({ok:true,id});}catch(e){if(e instanceof z.ZodError)return res.status(400).json({error:'Confira os dados da despesa.'});throw e}});
app.get('/api/admin/integrations',needAuth,needDb,async(req,res)=>{const feedToken=process.env.CALENDAR_FEED_TOKEN||(process.env.SETUP_TOKEN?crypto.createHash('sha256').update(process.env.SETUP_TOKEN+':calendar').digest('hex').slice(0,32):'');const base=(req.headers['x-forwarded-proto']||req.protocol)+'://'+req.get('host');res.json({database:true,emailAutomatic:Boolean(process.env.SMTP_HOST&&process.env.SMTP_USER&&process.env.SMTP_PASS),googleCalendarApi:Boolean(process.env.GOOGLE_CALENDAR_ID&&process.env.GOOGLE_SERVICE_ACCOUNT_EMAIL&&process.env.GOOGLE_PRIVATE_KEY),calendarFeed:Boolean(feedToken),calendarFeedUrl:feedToken?base+'/calendar/'+feedToken+'.ics':''})});

app.get('/api/admin/vaccines',needAuth,needDb,async(req,res)=>{try{
  const [due,cards]=await Promise.all([
    pool.query(`SELECT p.pet_name,p.species,p.tutor_name,p.tutor_phone,p.public_token,v.vaccine_name,v.next_due_date
      FROM cps_vaccinations v JOIN cps_pets p ON p.id=v.pet_id
      WHERE v.next_due_date BETWEEN CURRENT_DATE AND CURRENT_DATE+30
      ORDER BY v.next_due_date,p.pet_name`),
    pool.query(`SELECT p.id,p.pet_name,p.species,p.tutor_name,p.tutor_phone,p.public_token,
      (SELECT vaccine_name FROM cps_vaccinations v WHERE v.pet_id=p.id ORDER BY application_date DESC,created_at DESC LIMIT 1) latest_vaccine,
      (SELECT next_due_date FROM cps_vaccinations v WHERE v.pet_id=p.id AND next_due_date IS NOT NULL ORDER BY next_due_date ASC LIMIT 1) next_due_date
      FROM cps_pets p ORDER BY p.updated_at DESC,p.created_at DESC LIMIT 500`)
  ]);
  res.json({
    due:due.rows.map(x=>{const msg='Olá, '+x.tutor_name+'! 🐾 Passando para lembrar que a próxima dose de '+x.vaccine_name+' do(a) '+x.pet_name+' está prevista para '+String(x.next_due_date).slice(0,10)+'. Você também pode consultar o cartão de vacina online: '+(req.headers['x-forwarded-proto']||req.protocol)+'://'+req.get('host')+'/cartao/'+x.public_token;return{petName:x.pet_name,species:x.species,tutorName:x.tutor_name,tutorPhone:x.tutor_phone,publicToken:x.public_token,vaccineName:x.vaccine_name,nextDueDate:x.next_due_date,whatsappUrl:'https://wa.me/'+phone(x.tutor_phone)+'?text='+encodeURIComponent(msg)}}),
    cards:cards.rows.map(x=>({petId:x.id,petName:x.pet_name,species:x.species,tutorName:x.tutor_name,tutorPhone:x.tutor_phone,publicToken:x.public_token,latestVaccine:x.latest_vaccine,nextDueDate:x.next_due_date}))
  });
}catch(e){console.error(e);res.status(500).json({error:'Não foi possível carregar os cartões de vacina.'})}});

app.post('/api/admin/vaccinations',needAuth,needCsrf,needDb,async(req,res)=>{const schema=z.object({
  tutorName:z.string().trim().min(2).max(140),tutorPhone:z.string().trim().min(8).max(40),tutorEmail:z.string().trim().email().max(200).optional().or(z.literal('')),
  petName:z.string().trim().min(1).max(120),species:z.string().trim().min(2).max(100),vaccineName:z.string().trim().min(2).max(160),
  batch:z.string().trim().max(120).optional().default(''),applicationDate:z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  nextDueDate:z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional().or(z.literal('')),notes:z.string().trim().max(1000).optional().default('')
});try{
  const p=schema.parse(req.body), client=await pool.connect();
  let petId,publicToken;
  try{
    await client.query('BEGIN');
    const existing=await client.query('SELECT id,public_token FROM cps_pets WHERE tutor_phone=$1 AND LOWER(pet_name)=LOWER($2) ORDER BY created_at DESC LIMIT 1',[p.tutorPhone,p.petName]);
    if(existing.rowCount){petId=existing.rows[0].id;publicToken=existing.rows[0].public_token;await client.query('UPDATE cps_pets SET tutor_name=$1,tutor_email=$2,species=$3,updated_at=NOW() WHERE id=$4',[p.tutorName,p.tutorEmail||null,p.species,petId])}
    else{petId=crypto.randomUUID();publicToken=crypto.randomUUID();await client.query('INSERT INTO cps_pets(id,tutor_name,tutor_phone,tutor_email,pet_name,species,public_token) VALUES($1,$2,$3,$4,$5,$6,$7)',[petId,p.tutorName,p.tutorPhone,p.tutorEmail||null,p.petName,p.species,publicToken])}
    const vaccinationId=crypto.randomUUID();
    await client.query('INSERT INTO cps_vaccinations(id,pet_id,vaccine_name,application_date,next_due_date,batch,veterinarian,notes) VALUES($1,$2,$3,$4,$5,$6,$7,$8)',[vaccinationId,petId,p.vaccineName,p.applicationDate,p.nextDueDate||null,p.batch||null,'Isabela',p.notes||null]);
    await client.query('UPDATE cps_pets SET updated_at=NOW() WHERE id=$1',[petId]);
    await client.query('COMMIT');
    await audit(req,'create_vaccination','vaccination',vaccinationId,{petId,vaccine:p.vaccineName});
    res.status(201).json({ok:true,petId,vaccinationId,publicToken,cardUrl:'/cartao/'+publicToken});
  }catch(e){await client.query('ROLLBACK');throw e}finally{client.release()}
}catch(e){if(e instanceof z.ZodError)return res.status(400).json({error:'Confira os dados da vacinação.'});console.error(e);res.status(500).json({error:'Não foi possível registrar a vacinação.'})}});

app.get('/api/admin/finance',needAuth,needDb,async(req,res)=>{const [p,e]=await Promise.all([pool.query('SELECT p.id,p.booking_id,p.amount,p.method,p.paid_at,p.note,p.created_at,b.tutor_name,b.service FROM cps_payments p LEFT JOIN cps_bookings b ON b.id=p.booking_id ORDER BY p.paid_at DESC,p.created_at DESC LIMIT 500'),pool.query('SELECT id,amount,category,occurred_at,note,created_at FROM cps_expenses ORDER BY occurred_at DESC,created_at DESC LIMIT 500')]);res.json({payments:p.rows.map(x=>({...x,amount:Number(x.amount)})),expenses:e.rows.map(x=>({...x,amount:Number(x.amount)}))});});


app.use('/api',(req,res)=>res.status(404).json({error:'Rota da API não encontrada. Atualize a página e tente novamente.'}));
function icsEscape(v=''){return String(v).replace(/\\/g,'\\\\').replace(/\r?\n/g,'\\n').replace(/,/g,'\\,').replace(/;/g,'\\;')}
function isoDay(v){return v instanceof Date?v.toISOString().slice(0,10):String(v).slice(0,10)}
function icsDate(v){return isoDay(v).replace(/-/g,'')}
function icsNextDate(v){const x=new Date(isoDay(v)+'T12:00:00Z');x.setUTCDate(x.getUTCDate()+1);return x.toISOString().slice(0,10).replace(/-/g,'')}
function icsStamp(v=new Date()){const x=new Date(v);return x.toISOString().replace(/[-:]/g,'').replace(/\.\d{3}Z$/,'Z')}

app.get('/calendar/:token.ics',needDb,async(req,res)=>{try{
  const expected=process.env.CALENDAR_FEED_TOKEN||(process.env.SETUP_TOKEN?crypto.createHash('sha256').update(process.env.SETUP_TOKEN+':calendar').digest('hex').slice(0,32):'');
  if(!expected||req.params.token!==expected)return res.status(404).send('Not found');
  const q=await pool.query("SELECT * FROM cps_bookings WHERE status IN ('confirmed','completed') ORDER BY start_date,created_at");
  const lines=['BEGIN:VCALENDAR','VERSION:2.0','PRODID:-//Casal Pet Sitter//Agenda//PT-BR','CALSCALE:GREGORIAN','METHOD:PUBLISH','X-WR-CALNAME:Casal Pet Sitter','X-WR-TIMEZONE:America/Sao_Paulo'];
  for(const b of q.rows){
    const status=STATUS[b.status]||b.status,svc=SERVICE[b.service]||b.service;
    const details=[
      'Status: '+status,
      'Serviço: '+svc,
      'Tutor: '+b.tutor_name,
      'Telefone: '+b.phone,
      'Endereço: '+b.street+' — '+b.neighborhood+', Viçosa/MG',
      'Animais: '+b.animal_count+' ('+b.animals+')',
      ['pet_sitter','pet_sitter_passeio'].includes(b.service)?'Visitas por dia: '+b.visits:null,
      'Valor estimado: '+(b.estimated_total==null?'A confirmar':money(b.estimated_total)),
      b.notes?'Observações: '+b.notes:null
    ].filter(Boolean).join('\n');
    lines.push('BEGIN:VEVENT');
    lines.push('UID:'+b.id+'@casal-pet-sitter');
    lines.push('DTSTAMP:'+icsStamp(b.created_at));
    lines.push('LAST-MODIFIED:'+icsStamp(b.updated_at));
    lines.push('DTSTART;VALUE=DATE:'+icsDate(b.start_date));
    lines.push('DTEND;VALUE=DATE:'+icsNextDate(b.end_date));
    lines.push('SUMMARY:'+icsEscape('['+status+'] '+svc+' • '+b.tutor_name));
    lines.push('LOCATION:'+icsEscape(b.street+', '+b.neighborhood+', Viçosa - MG'));
    lines.push('DESCRIPTION:'+icsEscape(details));
    lines.push('END:VEVENT');
  }
  lines.push('END:VCALENDAR');
  res.setHeader('Content-Type','text/calendar; charset=utf-8');
  res.setHeader('Content-Disposition','inline; filename="casal-pet-sitter.ics"');
  res.setHeader('Cache-Control','no-store, max-age=0');
  res.send(lines.join('\r\n'));
}catch(e){console.error(e);res.status(500).send('Calendar unavailable')}});


app.get('/cartao/:token',needDb,async(req,res)=>{try{
  const pet=await pool.query('SELECT * FROM cps_pets WHERE public_token=$1',[req.params.token]);
  if(!pet.rowCount)return res.status(404).send('Cartão não encontrado.');
  const p=pet.rows[0],vacc=await pool.query('SELECT vaccine_name,application_date,next_due_date,batch,veterinarian,notes FROM cps_vaccinations WHERE pet_id=$1 ORDER BY application_date DESC,created_at DESC',[p.id]);
  const escHtml=v=>String(v??'').replace(/[&<>"']/g,ch=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[ch]));
  const dateBr=v=>{if(!v)return'—';const s=String(v).slice(0,10).split('-');return s.length===3?s.reverse().join('/'):String(v)};
  const rows=vacc.rows.map(v=>'<tr><td><strong>'+escHtml(v.vaccine_name)+'</strong></td><td>'+dateBr(v.application_date)+'</td><td>'+dateBr(v.next_due_date)+'</td><td>'+escHtml(v.batch||'—')+'</td></tr>').join('');
  res.send(`<!doctype html><html lang="pt-BR"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><meta name="theme-color" content="#B08A58"><title>Cartão de vacina • ${escHtml(p.pet_name)}</title><link rel="stylesheet" href="/styles.css"></head><body><main class="legal section-shell"><a class="back-link" href="/">← Casal Pet Sitter</a><div class="eyebrow">Cartão de vacina online</div><h1>${escHtml(p.pet_name)}</h1><p><strong>Tutor:</strong> ${escHtml(p.tutor_name)} &nbsp; • &nbsp; <strong>Espécie:</strong> ${escHtml(p.species)}</p><section class="panel-card"><h2>Histórico de vacinação</h2><div class="table-wrap"><table><thead><tr><th>Vacina</th><th>Aplicação</th><th>Próxima dose</th><th>Lote</th></tr></thead><tbody>${rows||'<tr><td colspan="4">Nenhuma vacina registrada.</td></tr>'}</tbody></table></div></section><section class="panel-card"><h2>Como funciona o lembrete?</h2><p class="muted">Mantemos a próxima dose registrada no sistema. Quando a data estiver se aproximando, o Casal Pet Sitter acompanha o vencimento e pode entrar em contato com o tutor para lembrar da vacinação.</p></section><p class="muted">Este cartão é um registro informativo dos atendimentos cadastrados pelo Casal Pet Sitter e não substitui documentos oficiais exigidos por autoridades ou estabelecimentos.</p></main></body></html>`);
}catch(e){console.error(e);res.status(500).send('Não foi possível abrir o cartão agora.')}});

app.get('/admin',(_req,res)=>res.sendFile(path.join(__dirname,'public','admin.html')));
app.get('/login',(_req,res)=>res.sendFile(path.join(__dirname,'public','login.html')));
app.get('/setup',(_req,res)=>res.sendFile(path.join(__dirname,'public','setup.html')));
app.get('/privacidade',(_req,res)=>res.sendFile(path.join(__dirname,'public','privacy.html')));
app.use((req,res,next)=>{if(req.path.startsWith('/api/'))return next();res.sendFile(path.join(__dirname,'public','index.html'))});
app.use((err,_req,res,_next)=>{console.error(err);res.status(500).json({error:'Erro interno.'})});

initDb().then(()=>app.listen(PORT,()=>console.log('Casal Pet Sitter online na porta '+PORT))).catch(err=>{console.error('Falha ao inicializar banco',err);app.listen(PORT,()=>console.log('Casal Pet Sitter em modo degradado na porta '+PORT))});
