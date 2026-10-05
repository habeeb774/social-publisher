"use client";
import { useEffect,useState } from "react";
import Link from "next/link";
export function CommentsOnboarding(){const [available,setAvailable]=useState(false);useEffect(()=>{fetch("/api/comments?view=capabilities").then(r=>r.ok?r.json():null).then(data=>setAvailable(Boolean(data?.read&&data?.connected))).catch(()=>{});},[]);return available?<section className="panel-card"><h2>تفعيل إدارة التعليقات</h2><p>اختبر قراءة التعليقات من صندوق الوارد. الجلب للقراءة فقط؛ لا يُرسل أي رد أثناء الإعداد.</p><Link className="secondary-button" href="/inbox">اختبار قراءة التعليقات</Link></section>:null;}
