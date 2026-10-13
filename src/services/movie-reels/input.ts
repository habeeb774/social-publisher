import { z } from "zod";

/** User declarations are evidence to review, never an approval or storage locator. */
export const createMovieSchema = z.object({
  title:z.string().trim().min(1).max(160),
  pageId:z.uuid(),
  rightsBasis:z.enum(["owned","licensed","public_domain"]),
  rightsEvidence:z.string().trim().min(10).max(4000),
  rightsExpiresAt:z.iso.datetime({offset:true}).nullable().default(null),
  facebookAllowed:z.literal(true), excerptsAllowed:z.literal(true),
  declaration:z.literal(true),
}).strict();

export type CreateMovieInput = z.infer<typeof createMovieSchema>;
export function movieDraft(input:CreateMovieInput, ownerUserId:string, now=new Date()) {
  if(!z.uuid().safeParse(ownerUserId).success) throw new Error("MOVIE_USER_ACCOUNT_REQUIRED");
  if(input.rightsExpiresAt && new Date(input.rightsExpiresAt).getTime()<=now.getTime()) throw new Error("MOVIE_LICENSE_EXPIRED");
  return {ownerUserId,title:input.title,pageId:input.pageId,rightsBasis:input.rightsBasis,
    rightsEvidence:input.rightsEvidence,rightsExpiresAt:input.rightsExpiresAt?new Date(input.rightsExpiresAt):null,
    facebookAllowed:input.facebookAllowed,excerptsAllowed:input.excerptsAllowed,
    rightsStatus:"pending",status:"draft",rightsVerifiedBy:null,rightsVerifiedAt:null,sourceStorageKey:null};
}
