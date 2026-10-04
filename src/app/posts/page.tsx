import Link from "next/link";
export default function Posts(){return <main className="shell"><h1>المنشورات</h1><div className="banner">لا توجد منشورات بعد. يمكنك استيراد ملف Excel أو إنشاء منشور جديد.</div><Link href="/posts/new">إنشاء منشور</Link></main>}
