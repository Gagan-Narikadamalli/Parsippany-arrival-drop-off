const { neon } = require("@neondatabase/serverless");

async function ensureSchema(sql){
  await sql`CREATE TABLE IF NOT EXISTS visit_submissions (
    id UUID PRIMARY KEY,
    parent_name TEXT NOT NULL,
    client_name TEXT NOT NULL,
    visit_date DATE,
    visit_time TIME,
    arrival_time TIME,
    departure_time TIME
  )`;
  await sql`ALTER TABLE visit_submissions ADD COLUMN IF NOT EXISTS visit_date DATE`;
  await sql`ALTER TABLE visit_submissions ADD COLUMN IF NOT EXISTS visit_time TIME`;
  await sql`ALTER TABLE visit_submissions ADD COLUMN IF NOT EXISTS arrival_time TIME`;
  await sql`ALTER TABLE visit_submissions ADD COLUMN IF NOT EXISTS departure_time TIME`;
  await sql`ALTER TABLE visit_submissions ADD COLUMN IF NOT EXISTS client_first_name TEXT`;
  await sql`ALTER TABLE visit_submissions ADD COLUMN IF NOT EXISTS client_last_name TEXT`;
  await sql`ALTER TABLE visit_submissions ADD COLUMN IF NOT EXISTS arrival_guardian_name TEXT`;
  await sql`ALTER TABLE visit_submissions ADD COLUMN IF NOT EXISTS departure_guardian_name TEXT`;

  const oldColumn=await sql`SELECT 1 FROM information_schema.columns
    WHERE table_schema='public' AND table_name='visit_submissions' AND column_name='submitted_at'`;
  if(oldColumn.length){
    await sql`UPDATE visit_submissions SET
      visit_date=COALESCE(visit_date,(submitted_at AT TIME ZONE 'America/New_York')::date),
      visit_time=COALESCE(visit_time,(submitted_at AT TIME ZONE 'America/New_York')::time)`;
    await sql`ALTER TABLE visit_submissions DROP COLUMN submitted_at`;
  }
  await sql`ALTER TABLE visit_submissions ALTER COLUMN visit_date SET NOT NULL`;
  await sql`ALTER TABLE visit_submissions ALTER COLUMN visit_time SET NOT NULL`;
  await sql`UPDATE visit_submissions SET arrival_time=visit_time WHERE arrival_time IS NULL`;
  await sql`UPDATE visit_submissions SET
    client_first_name=COALESCE(client_first_name,split_part(regexp_replace(TRIM(client_name),'[[:space:]]+',' ','g'),' ',1)),
    client_last_name=COALESCE(client_last_name,CASE WHEN regexp_replace(TRIM(client_name),'[[:space:]]+',' ','g') LIKE '% %' THEN substring(regexp_replace(TRIM(client_name),'[[:space:]]+',' ','g') FROM position(' ' IN regexp_replace(TRIM(client_name),'[[:space:]]+',' ','g'))+1) ELSE '' END)`;
  await sql`UPDATE visit_submissions SET arrival_guardian_name=COALESCE(arrival_guardian_name,parent_name)`;
}

function cleanName(value){return String(value||"").trim().replace(/\s+/g," ");}

module.exports = async function handler(req,res){
  if(!process.env.DATABASE_URL)return res.status(503).json({ok:false,error:"Database setup is not complete yet."});

  if(req.method==="GET"){
    try{
      const sql=neon(process.env.DATABASE_URL);
      await ensureSchema(sql);
      return res.status(200).json({ok:true,database:"connected"});
    }catch(error){
      return res.status(503).json({ok:false,database:"unavailable"});
    }
  }
  if(req.method!=="POST")return res.status(405).json({ok:false,error:"Method not allowed."});

  const parentName=cleanName(req.body?.parentName);
  const clientFirstName=cleanName(req.body?.clientFirstName);
  const clientLastName=cleanName(req.body?.clientLastName);
  const clientName=`${clientFirstName} ${clientLastName}`;
  const visitAction=String(req.body?.visitAction||"");
  const arrivalTime=String(req.body?.arrivalTime||"");
  const departureTime=String(req.body?.departureTime||"");
  if(!parentName||!clientFirstName||!clientLastName)return res.status(400).json({ok:false,error:"Parent or guardian name, client first name, and client last name are required."});
  if(parentName.length>120||clientFirstName.length>60||clientLastName.length>60)return res.status(400).json({ok:false,error:"One or more names are too long."});
  const validTime=value=>/^([01]\d|2[0-3]):[0-5]\d$/.test(value);
  if(!["arrival","departure"].includes(visitAction))return res.status(400).json({ok:false,error:"Choose drop-off or pickup."});
  if(visitAction==="arrival"&&!validTime(arrivalTime))return res.status(400).json({ok:false,error:"Enter a valid drop-off time."});
  if(visitAction==="departure"&&!validTime(departureTime))return res.status(400).json({ok:false,error:"Enter a valid pickup time."});

  try{
    const sql=neon(process.env.DATABASE_URL);
    await ensureSchema(sql);
    if(visitAction==="arrival"){
      const open=await sql`SELECT id FROM visit_submissions WHERE visit_date=(CURRENT_TIMESTAMP AT TIME ZONE 'America/New_York')::date AND LOWER(TRIM(client_first_name))=LOWER(${clientFirstName}) AND LOWER(TRIM(client_last_name))=LOWER(${clientLastName}) AND departure_time IS NULL LIMIT 1`;
      if(open.length)return res.status(409).json({ok:false,error:"This client already has a drop-off recorded today. Choose Pickup to record when the client leaves."});
      const id=crypto.randomUUID();
      const rows=await sql`INSERT INTO visit_submissions (id,parent_name,arrival_guardian_name,departure_guardian_name,client_name,client_first_name,client_last_name,visit_date,visit_time,arrival_time,departure_time)
        VALUES (${id},${parentName},${parentName},NULL,${clientName},${clientFirstName},${clientLastName},(CURRENT_TIMESTAMP AT TIME ZONE 'America/New_York')::date,${arrivalTime}::time,${arrivalTime}::time,NULL)
        RETURNING visit_date,arrival_time,departure_time`;
      return res.status(201).json({ok:true,action:"arrival",visitDate:rows[0].visit_date,arrivalTime:rows[0].arrival_time});
    }

    const open=await sql`SELECT id,COALESCE(arrival_time,visit_time) AS arrival_time FROM visit_submissions WHERE visit_date=(CURRENT_TIMESTAMP AT TIME ZONE 'America/New_York')::date AND LOWER(TRIM(client_first_name))=LOWER(${clientFirstName}) AND LOWER(TRIM(client_last_name))=LOWER(${clientLastName}) AND departure_time IS NULL ORDER BY COALESCE(arrival_time,visit_time) DESC LIMIT 1`;
    if(!open.length)return res.status(404).json({ok:false,error:"No open drop-off was found today for this client. Check the client first and last name and try again."});
    if(departureTime<String(open[0].arrival_time).slice(0,5))return res.status(400).json({ok:false,error:"Pickup time cannot be earlier than the recorded drop-off time."});
    const rows=await sql`UPDATE visit_submissions SET departure_time=${departureTime}::time,departure_guardian_name=${parentName} WHERE id=${open[0].id}::uuid RETURNING visit_date,arrival_time,departure_time`;
    return res.status(200).json({ok:true,action:"departure",visitDate:rows[0].visit_date,arrivalTime:rows[0].arrival_time,departureTime:rows[0].departure_time});
  }catch(error){
    console.error("Form submission failed",{name:error?.name||"Error"});
    return res.status(500).json({ok:false,error:"The form could not be submitted. Please try again."});
  }
};
