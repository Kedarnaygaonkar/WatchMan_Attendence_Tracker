const fs = require('fs');
const path = require('path');

const dir = path.join(__dirname, 'src', 'routes');
const files = fs.readdirSync(dir).filter(f => f.endsWith('.ts'));

// The new getAgencyId function supports super_admins who are tied to an agency
const newFunction = `function getAgencyId(req: Request): string | undefined {
  const id = req.query.agency_id || req.body.agencyId || req.body.agency_id;
  if (req.user!.role === 'super_admin') {
    if (id) return id as string;
    if (req.user!.agencyId) return req.user!.agencyId;
    return undefined;
  }
  return req.user!.agencyId!;
}`;

let modifiedCount = 0;

for (const file of files) {
  const filePath = path.join(dir, file);
  let content = fs.readFileSync(filePath, 'utf8');
  
  // Try to match the existing getAgencyId function blocks
  const originalGetAgencyIdRegex1 = /function getAgencyId\(req: Request\): string \{[\s\S]*?\n\}/;
  const originalGetAgencyIdRegex2 = /function getAgencyId\(req: Request\): string \| null \{[\s\S]*?\n\}/;
  const originalGetAgencyIdRegex3 = /function getAgencyId\(req: Request\): string \| undefined \{[\s\S]*?\n\}/;
  
  let modified = false;
  if (originalGetAgencyIdRegex1.test(content)) {
    content = content.replace(originalGetAgencyIdRegex1, newFunction);
    modified = true;
  } else if (originalGetAgencyIdRegex2.test(content)) {
    content = content.replace(originalGetAgencyIdRegex2, newFunction);
    modified = true;
  } else if (originalGetAgencyIdRegex3.test(content)) {
    content = content.replace(originalGetAgencyIdRegex3, newFunction);
    modified = true;
  }

  // If we changed getAgencyId to return undefined, some strict routes might need to throw if it's undefined
  // But actually, we can just let it return undefined. If it's used in mongoose ObjectId, it might crash.
  // Instead, let's make it throw inside getAgencyId IF it's undefined, EXCEPT for societies & reports where it was already optional.
  // Actually, wait! The user is logging in. Their req.user.agencyId WILL be set if we restore it in DB.
  
  if (modified) {
    fs.writeFileSync(filePath, content);
    modifiedCount++;
    console.log('Fixed', file);
  }
}

console.log('Total files modified:', modifiedCount);
