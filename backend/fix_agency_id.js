const fs = require('fs');
const path = require('path');

const dir = path.join(__dirname, 'src', 'routes');
const files = ['watchmen.ts', 'shifts.ts', 'replacements.ts', 'dashboard.ts', 'assignments.ts', 'reports.ts'];

const newGetAgencyId = `function getAgencyId(req: Request, required = false): string | undefined {
  if (req.user!.role === 'super_admin') {
    const id = req.query.agency_id || req.body.agencyId || req.body.agency_id;
    if (required && !id) throw new AppError('agency_id required for super_admin', 400);
    return id as string | undefined;
  }
  return req.user!.agencyId!;
}`;

for (const file of files) {
  const filePath = path.join(dir, file);
  if (!fs.existsSync(filePath)) continue;
  
  let content = fs.readFileSync(filePath, 'utf8');
  
  // Replace the old getAgencyId function
  content = content.replace(/function getAgencyId\(req: Request\)[^{]*\{[\s\S]*?\n\}/, newGetAgencyId);
  content = content.replace(/function getAgencyId\(req: Request\): string \| undefined \{[\s\S]*?\n\}/, newGetAgencyId);
  
  // Fix matchStages and filters
  // Case 1: const agencyId = getAgencyId(req); const matchStage: any = { agency_id: new ...ObjectId(agencyId) };
  content = content.replace(
    /const matchStage: any = \{ agency_id: [^\}]+\(agencyId\) \};/,
    `const matchStage: any = {};\n  if (agencyId) matchStage.agency_id = new (require('mongoose').Types.ObjectId)(agencyId);`
  );
  
  // Case 2: const matchStage: any = { agency_id: agencyId ... }
  content = content.replace(
    /const matchStage: any = \{ agency_id: agencyId,? (.*?)\}?;/,
    `const matchStage: any = { $1 };\n  if (agencyId) matchStage.agency_id = agencyId;`
  );
  
  // Case 3: Attendance.find({ agency_id: agencyId, ... }) -> need to build filter
  // This is too specific for regex, let's just make getAgencyId(req, true) on POST/PUT
  
  // Replace getAgencyId(req) with getAgencyId(req, true) for POST/PUT routes
  content = content.replace(/router\.post\([^,]+,.*?(asyncHandler\(async \(req: Request, res: Response\) => \{[\s\S]*?const agencyId = getAgencyId\(req\);)/g, (match, p1) => {
    return match.replace('getAgencyId(req)', 'getAgencyId(req, true)');
  });
  content = content.replace(/router\.put\([^,]+,.*?(asyncHandler\(async \(req: Request, res: Response\) => \{[\s\S]*?const agencyId = getAgencyId\(req\);)/g, (match, p1) => {
    return match.replace('getAgencyId(req)', 'getAgencyId(req, true)');
  });
  
  fs.writeFileSync(filePath, content);
}
console.log('Fixed backend routes.');
