import { Router, Request, Response } from 'express';
import bcrypt from 'bcryptjs';
import { z } from 'zod';
import { authenticate, requireRole } from '../middleware/auth';
import { asyncHandler, AppError } from '../middleware/errorHandler';
import { Agency, User } from '../models';

const router = Router();

// Only super_admin can manage agencies
router.use(authenticate);
router.use(requireRole(['super_admin']));

// ── Validation Schemas ───────────────────────────────────────────────
const createSchema = z.object({
  name: z.string().min(1, 'Name is required'),
  email: z.string().email('Invalid email address'),
  password: z.string().min(6, 'Password must be at least 6 characters').optional(),
  phone: z.string().optional(),
  address: z.string().optional(),
  logo_url: z.string().optional(),
  banner_url: z.string().optional(),
  footer_url: z.string().optional(),
  background_url: z.string().optional(),
  status: z.enum(['active', 'inactive', 'suspended']).default('active'),
});

const updateSchema = createSchema.partial();

const credentialsSchema = z.object({
  email: z.string().email('Invalid email address').optional(),
  password: z.string().min(6, 'Password must be at least 6 characters'),
});

// ── GET /api/agencies ────────────────────────────────────────────────
router.get(
  '/',
  asyncHandler(async (req: Request, res: Response) => {
    const { active, search } = req.query;

    const filter: any = {};
    if (active === 'true') filter.status = 'active';

    if (search) {
      filter.$or = [
        { name: { $regex: search, $options: 'i' } },
        { email: { $regex: search, $options: 'i' } },
      ];
    }

    const agencies = await Agency.find(filter).sort({ name: 1 });
    const agencyIds = agencies.map((a) => a._id);

    const adminUsers = await User.find({
      agency_id: { $in: agencyIds },
      role: 'agency_admin',
    }).select('email name agency_id is_active createdAt last_login');

    const adminByAgencyId = new Map(
      adminUsers
        .filter((u) => u.agency_id)
        .map((u) => [u.agency_id!.toString(), u])
    );

    const agenciesWithAdmin = agencies.map((agency) => {
      const agencyJson: any = agency.toJSON();
      const admin = adminByAgencyId.get(agency._id.toString());
      return {
        ...agencyJson,
        admin_user: admin
          ? {
              email: admin.email,
              name: admin.name,
              is_active: admin.is_active,
              last_login: admin.last_login,
            }
          : null,
        has_credentials: Boolean(admin),
      };
    });

    res.json({ success: true, data: agenciesWithAdmin });
  })
);

// ── POST /api/agencies ───────────────────────────────────────────────
router.post(
  '/',
  asyncHandler(async (req: Request, res: Response) => {
    const parse = createSchema.safeParse(req.body);
    if (!parse.success) {
      throw new AppError(parse.error.flatten().fieldErrors as any, 400);
    }

    const email = parse.data.email.toLowerCase().trim();

    const existing = await Agency.findOne({ email }).lean();
    if (existing) {
      throw new AppError('Agency with this email already exists', 400);
    }

    const existingUser = await User.findOne({ email });
    if (existingUser && existingUser.role !== 'agency_admin') {
      throw new AppError('A user account with this email already exists under a different role', 400);
    }

    const { password, ...agencyData } = parse.data;
    const agency = await Agency.create({ ...agencyData, email });

    // Create or update agency admin User account if password provided
    if (password) {
      const passwordHash = await bcrypt.hash(password, 12);
      if (existingUser) {
        existingUser.agency_id = agency._id;
        existingUser.password_hash = passwordHash;
        existingUser.role = 'agency_admin';
        existingUser.name = `${agency.name} Admin`;
        existingUser.phone = agency.phone;
        existingUser.is_active = agency.status === 'active';
        await existingUser.save();
      } else {
        await User.create({
          agency_id: agency._id,
          email,
          password_hash: passwordHash,
          role: 'agency_admin',
          name: `${agency.name} Admin`,
          phone: agency.phone,
          is_active: agency.status === 'active',
        });
      }
    }

    res.status(201).json({
      success: true,
      data: agency,
      has_credentials: Boolean(password),
    });
  })
);

// ── PUT /api/agencies/:id ────────────────────────────────────────────
router.put(
  '/:id',
  asyncHandler(async (req: Request, res: Response) => {
    const parse = updateSchema.safeParse(req.body);
    if (!parse.success) {
      throw new AppError(parse.error.flatten().fieldErrors as any, 400);
    }

    const { id } = req.params;
    const existingAgency = await Agency.findById(id);
    if (!existingAgency) throw new AppError('Agency not found', 404);

    const oldEmail = existingAgency.email.toLowerCase().trim();
    const newEmail = parse.data.email ? parse.data.email.toLowerCase().trim() : oldEmail;

    if (parse.data.email && newEmail !== oldEmail) {
      const duplicateAgency = await Agency.findOne({ email: newEmail, _id: { $ne: id } }).lean();
      if (duplicateAgency) {
        throw new AppError('Another agency with this email already exists', 400);
      }
    }

    const { password, ...agencyUpdateData } = parse.data;
    if (agencyUpdateData.email) {
      agencyUpdateData.email = newEmail;
    }

    const agency = await Agency.findByIdAndUpdate(
      id,
      { $set: agencyUpdateData },
      { new: true, runValidators: true }
    );

    if (!agency) throw new AppError('Agency not found', 404);

    // Look for existing agency admin user
    let adminUser = await User.findOne({ agency_id: agency._id, role: 'agency_admin' });
    if (!adminUser) {
      adminUser = await User.findOne({ email: oldEmail });
    }

    if (password) {
      const passwordHash = await bcrypt.hash(password, 12);
      if (adminUser) {
        adminUser.agency_id = agency._id;
        adminUser.email = newEmail;
        adminUser.password_hash = passwordHash;
        adminUser.role = 'agency_admin';
        if (parse.data.name) adminUser.name = `${agency.name} Admin`;
        adminUser.phone = agency.phone;
        adminUser.is_active = agency.status === 'active';
        await adminUser.save();
      } else {
        await User.create({
          agency_id: agency._id,
          email: newEmail,
          password_hash: passwordHash,
          role: 'agency_admin',
          name: `${agency.name} Admin`,
          phone: agency.phone,
          is_active: agency.status === 'active',
        });
      }
    } else if (adminUser) {
      // Synchronize email and status changes to admin user
      let needsSave = false;
      if (adminUser.email !== newEmail) {
        adminUser.email = newEmail;
        needsSave = true;
      }
      if (agencyUpdateData.status) {
        adminUser.is_active = agency.status === 'active';
        needsSave = true;
      }
      if (!adminUser.agency_id || adminUser.agency_id.toString() !== agency._id.toString()) {
        adminUser.agency_id = agency._id;
        needsSave = true;
      }
      if (needsSave) {
        await adminUser.save();
      }
    }

    res.json({ success: true, data: agency });
  })
);

// ── POST /api/agencies/:id/credentials ───────────────────────────────
router.post(
  '/:id/credentials',
  asyncHandler(async (req: Request, res: Response) => {
    const parse = credentialsSchema.safeParse(req.body);
    if (!parse.success) {
      throw new AppError(parse.error.flatten().fieldErrors as any, 400);
    }

    const { id } = req.params;
    const agency = await Agency.findById(id);
    if (!agency) throw new AppError('Agency not found', 404);

    const email = parse.data.email ? parse.data.email.toLowerCase().trim() : agency.email.toLowerCase().trim();
    const passwordHash = await bcrypt.hash(parse.data.password, 12);

    let adminUser = await User.findOne({ agency_id: agency._id, role: 'agency_admin' });
    if (!adminUser) {
      adminUser = await User.findOne({ email });
    }

    if (adminUser) {
      adminUser.agency_id = agency._id;
      adminUser.email = email;
      adminUser.password_hash = passwordHash;
      adminUser.role = 'agency_admin';
      adminUser.is_active = agency.status === 'active';
      await adminUser.save();
    } else {
      adminUser = await User.create({
        agency_id: agency._id,
        email,
        password_hash: passwordHash,
        role: 'agency_admin',
        name: `${agency.name} Admin`,
        phone: agency.phone,
        is_active: agency.status === 'active',
      });
    }

    if (agency.email !== email) {
      agency.email = email;
      await agency.save();
    }

    res.json({
      success: true,
      message: 'Agency credentials updated successfully',
      data: {
        email: adminUser.email,
        agency_id: agency._id,
      },
    });
  })
);

export default router;
