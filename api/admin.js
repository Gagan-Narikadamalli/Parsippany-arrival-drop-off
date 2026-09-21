const crypto=require("crypto");
const {neon}=require("@neondatabase/serverless");
function authorized(value){const a=Buffer.from(String(value||""));const b=Buffer.from(String(process.env.ADMIN_PASSWORD||""));return a.length===b.length&&a.length>0&&crypto.timingSafeEqual(a,b);}
function validDate(value){return /^\d{4}-\d{2}-\d{2}$/.test(String(value||""));}
function validTime(value){return /^([01]\d|2[0-3]):[0-5]\d(:[0-5]\d)?$/.test(String(value||""));}
const storageLimitBytes=Number(process.env.DATABASE_STORAGE_LIMIT_BYTES)||500000000;
async function ensureVisitTimes(sql){await sql`ALTER TABLE visit_submissions ADD COLUMN IF NOT EXISTS arrival_time TIME`;await sql`ALTER TABLE visit_submissions ADD COLUMN IF NOT EXISTS departure_time TIME`;await sql`ALTER TABLE visit_submissions ADD COLUMN IF NOT EXISTS client_first_name TEXT`;await sql`ALTER TABLE visit_submissions ADD COLUMN IF NOT EXISTS client_last_name TEXT`;await sql`ALTER TABLE visit_submissions ADD COLUMN IF NOT EXISTS arrival_guardian_name TEXT`;await sql`ALTER TABLE visit_submissions ADD COLUMN IF NOT EXISTS departure_guardian_name TEXT`;await sql`UPDATE visit_submissions SET arrival_time=visit_time WHERE arrival_time IS NULL`;await sql`UPDATE visit_submissions SET client_first_name=COALESCE(client_first_name,split_part(regexp_replace(TRIM(client_name),'[[:space:]]+',' ','g'),' ',1)),client_last_name=COALESCE(client_last_name,CASE WHEN regexp_replace(TRIM(client_name),'[[:space:]]+',' ','g') LIKE '% %' THEN substring(regexp_replace(TRIM(client_name),'[[:space:]]+',' ','g') FROM position(' ' IN regexp_replace(TRIM(client_name),'[[:space:]]+',' ','g'))+1) ELSE '' END),arrival_guardian_name=COALESCE(arrival_guardian_name,parent_name)`;}
module.exports=async function handler(req,res){
  res.setHeader("Cache-Control","no-store");if(req.method!=="POST")return res.status(405).json({ok:false,error:"Method not allowed."});
  if(!process.env.DATABASE_URL||!process.env.ADMIN_PASSWORD)return res.status(503).json({ok:false,error:"Admin setup is incomplete."});
  if(!authorized(req.body?.password))return res.status(401).json({ok:false,error:"Incorrect admin password."});
  const sql=neon(process.env.DATABASE_URL);const action=String(req.body?.action||"");
  try{
    await ensureVisitTimes(sql);
    if(action==="list"){
      const from=String(req.body?.fromDate||"");const to=String(req.body?.toDate||"");const name=String(req.body?.clientName||"").trim();if(!validDate(from)||!validDate(to)||from>to)return res.status(400).json({ok:false,error:"Choose a valid date range."});let records;
      if(name){records=await sql`SELECT id,parent_name,arrival_guardian_name,departure_guardian_name,client_name,client_first_name,client_last_name,visit_date,COALESCE(arrival_time,visit_time) AS arrival_time,departure_time FROM visit_submissions WHERE visit_date BETWEEN ${from}::date AND ${to}::date AND (LOWER(TRIM(client_name))=LOWER(${name}) OR LOWER(TRIM(arrival_guardian_name))=LOWER(${name}) OR LOWER(TRIM(departure_guardian_name))=LOWER(${name})) ORDER BY visit_date DESC,COALESCE(arrival_time,visit_time) DESC`;}
      else{records=await sql`SELECT id,parent_name,arrival_guardian_name,departure_guardian_name,client_name,client_first_name,client_last_name,visit_date,COALESCE(arrival_time,visit_time) AS arrival_time,departure_time FROM visit_submissions WHERE visit_date BETWEEN ${from}::date AND ${to}::date ORDER BY visit_date DESC,COALESCE(arrival_time,visit_time) DESC`;}
      const sizeRows=await sql`SELECT pg_database_size(current_database())::bigint AS used_bytes`;
      const usedBytes=Number(sizeRows[0]?.used_bytes||0);const remainingBytes=Math.max(storageLimitBytes-usedBytes,0);const percentUsed=storageLimitBytes>0?usedBytes/storageLimitBytes*100:0;
      return res.status(200).json({ok:true,records,storage:{usedBytes,limitBytes:storageLimitBytes,remainingBytes,percentUsed}});
    }
    if(action==="update"){
      const id=String(req.body?.id||"");const arrivalGuardian=String(req.body?.arrivalGuardianName||"").trim().replace(/\s+/g," ");const departureGuardian=String(req.body?.departureGuardianName||"").trim().replace(/\s+/g," ");const first=String(req.body?.clientFirstName||"").trim().replace(/\s+/g," ");const last=String(req.body?.clientLastName||"").trim().replace(/\s+/g," ");const client=`${first} ${last}`;const date=String(req.body?.visitDate||"");const arrival=String(req.body?.arrivalTime||"");const departure=String(req.body?.departureTime||"");if(!/^[0-9a-f-]{36}$/i.test(id)||!arrivalGuardian||!first||!last||arrivalGuardian.length>120||departureGuardian.length>120||first.length>60||last.length>60||!validDate(date)||!validTime(arrival)||departure&&!validTime(departure))return res.status(400).json({ok:false,error:"Enter valid names, date, arrival time, and optional departure information."});if(departure&&departure<arrival)return res.status(400).json({ok:false,error:"Departure time cannot be earlier than arrival time."});const rows=await sql`UPDATE visit_submissions SET parent_name=${arrivalGuardian},arrival_guardian_name=${arrivalGuardian},departure_guardian_name=${departureGuardian||null},client_name=${client},client_first_name=${first},client_last_name=${last},visit_date=${date}::date,visit_time=${arrival}::time,arrival_time=${arrival}::time,departure_time=${departure||null}::time WHERE id=${id}::uuid RETURNING id`;if(!rows.length)return res.status(404).json({ok:false,error:"Visit record was not found."});return res.status(200).json({ok:true});
    }
    if(action==="delete"){
      const id=String(req.body?.id||"");if(!/^[0-9a-f-]{36}$/i.test(id))return res.status(400).json({ok:false,error:"Invalid visit record."});const rows=await sql`DELETE FROM visit_submissions WHERE id=${id}::uuid RETURNING id`;if(!rows.length)return res.status(404).json({ok:false,error:"Visit record was not found."});return res.status(200).json({ok:true});
    }
    return res.status(400).json({ok:false,error:"Unknown admin action."});
  }catch(error){console.error("Admin request failed",{name:error?.name||"Error",action});return res.status(500).json({ok:false,error:"Admin request could not be completed."});}
};
