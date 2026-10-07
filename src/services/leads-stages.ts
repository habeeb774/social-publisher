export const LEAD_STAGES = ["new", "contacted", "interested", "qualified", "proposal", "won", "lost"] as const;
export const LEAD_LABELS: Record<typeof LEAD_STAGES[number], string> = {
  new: "جديد", contacted: "تم التواصل", interested: "مهتم", qualified: "مؤهل", proposal: "عرض مقدم", won: "تم التحويل", lost: "غير مهتم",
};
