import {z} from 'zod';

const errors:Record<string,{status:number;error:string}>={
  INVALID_CURSOR:{status:400,error:'تعذر قراءة موضع القائمة. حدّث الصفحة وحاول مجددًا.'},
  COMMENT_NOT_FOUND:{status:404,error:'التعليق غير موجود أو غير متاح لك.'},
  REPLY_NOT_FOUND:{status:404,error:'الرد غير موجود أو غير متاح لك.'},
  USER_NOT_FOUND:{status:404,error:'عضو الفريق غير متاح.'},
  NOT_FOUND:{status:404,error:'العنصر غير موجود.'},
  TEMPLATE_UNAVAILABLE:{status:409,error:'قالب الرد غير متاح. اختر قالبًا آخر.'},
  REPLY_NOT_PENDING:{status:409,error:'تغيّرت حالة الرد. حدّث المحادثة قبل الموافقة.'},
  REPLY_NOT_APPROVED:{status:409,error:'الرد غير معتمد أو سبق إرساله. حدّث المحادثة.'},
  COMMENTS_AUTH_REQUIRED:{status:409,error:'اتصال الصفحة غير جاهز. أعد ربطها.'},
  COMMENTS_REPLY_UNAVAILABLE:{status:409,error:'اتصال الصفحة الحالي لا يوفر صلاحية الرد على التعليقات.'},
  COMMENTS_HIDE_UNAVAILABLE:{status:409,error:'اتصال الصفحة الحالي لا يوفر صلاحية إخفاء التعليقات.'},
  COMMENTS_READ_UNAVAILABLE:{status:409,error:'قراءة التعليقات غير متاحة لاتصال الصفحة الحالي.'},
  COMMENTS_READ_PENDING:{status:409,error:'طلب جلب التعليقات ما زال قيد المعالجة. حاول لاحقًا.'},
};
export function commentFailure(error:unknown){
  if(error instanceof z.ZodError)return {status:400,code:'INVALID_FILTER',error:'تحقق من حقول البحث والتصفية.'};
  const code=error instanceof Error?error.message:'';
  if(Object.hasOwn(errors,code))return {code,...errors[code]};
  return {status:503,code:'COMMENTS_INTERNAL_ERROR',error:'تعذر تنفيذ العملية. حاول مجددًا أو راجع حالة التكامل.'};
}
