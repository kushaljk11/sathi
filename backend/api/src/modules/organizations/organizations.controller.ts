import type { Request } from 'express';
import { asyncHandler } from '../../utils/async-handler.util';
import { ok } from '../../utils/response.util';
import * as service from './organizations.service';
import type { AddStaffInput, AttendanceInput, BookingStatusInput, IdParams, OrganizationProfileInput, ProgramInput, ServiceInput } from './organizations.types';

const idOf = (req: Request) => (req.params as IdParams).id;

// =============== PROFILE, DOCUMENTS, STAFF ===============
export const getOrganization = asyncHandler(async (req, res) => {
  ok(res, await service.getOrganization(req.user!.id));
});

export const updateOrganization = asyncHandler(async (req, res) => {
  ok(res, await service.updateOrganization(req.user!.id, req.body as OrganizationProfileInput));
});

export const uploadDocument = asyncHandler(async (req, res) => {
  ok(res, await service.addOrganizationDocument(req.user!.id, req.file), 201);
});

export const submitVerification = asyncHandler(async (req, res) => {
  ok(res, await service.submitOrganizationVerification(req.user!.id));
});

export const addStaff = asyncHandler(async (req, res) => {
  ok(res, await service.addStaff(req.user!.id, req.body as AddStaffInput), 201);
});

export const removeStaff = asyncHandler(async (req, res) => {
  ok(res, await service.removeStaff(req.user!.id, String(req.params.userId)));
});

// =============== PROGRAMS ===============
export const listPrograms = asyncHandler(async (req, res) => {
  ok(res, await service.listPrograms(req.user!.id));
});

export const createProgram = asyncHandler(async (req, res) => {
  ok(res, await service.createProgram(req.user!.id, req.body as ProgramInput), 201);
});

export const updateProgram = asyncHandler(async (req, res) => {
  ok(res, await service.updateProgram(req.user!.id, idOf(req), req.body as ProgramInput));
});

export const submitProgram = asyncHandler(async (req, res) => {
  ok(res, await service.submitProgram(req.user!.id, idOf(req)));
});

export const archiveProgram = asyncHandler(async (req, res) => {
  ok(res, await service.archiveProgram(req.user!.id, idOf(req)));
});

export const listProgramBookings = asyncHandler(async (req, res) => {
  ok(res, await service.listProgramBookings(req.user!.id, idOf(req)));
});

export const recordAttendance = asyncHandler(async (req, res) => {
  ok(res, await service.recordAttendance(req.user!.id, idOf(req), req.body as AttendanceInput));
});

export const updateBookingStatus = asyncHandler(async (req, res) => {
  ok(res, await service.updateBookingStatus(req.user!.id, idOf(req), req.body as BookingStatusInput));
});

// =============== SERVICES ===============
export const listServices = asyncHandler(async (req, res) => {
  ok(res, await service.listServices(req.user!.id));
});

export const createService = asyncHandler(async (req, res) => {
  ok(res, await service.createService(req.user!.id, req.body as ServiceInput), 201);
});

export const updateService = asyncHandler(async (req, res) => {
  ok(res, await service.updateService(req.user!.id, idOf(req), req.body as ServiceInput));
});

export const submitService = asyncHandler(async (req, res) => {
  ok(res, await service.submitService(req.user!.id, idOf(req)));
});

export const archiveService = asyncHandler(async (req, res) => {
  ok(res, await service.archiveService(req.user!.id, idOf(req)));
});
