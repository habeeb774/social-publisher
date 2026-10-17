import {z} from 'zod';
export {canonicalUrl,hash,normalizedTitle,similarity,speculative,validArabicPost,retryDelaySeconds,riyadhDay} from '../elon-news/model';

// Only directly operated, tested HTTPS feeds; no unofficial mirrors or arbitrary URLs.
export const SOURCES=[
 {id:'openai',name:'OpenAI — المصدر الرسمي',url:'https://openai.com/news/rss.xml',host:'openai.com',group:'openai'},
 {id:'google',name:'Google AI — المصدر الرسمي',url:'https://blog.google/innovation-and-ai/technology/ai/rss/',host:'blog.google',group:'google'},
 {id:'huggingface',name:'Hugging Face — المدونة الرسمية',url:'https://huggingface.co/blog/feed.xml',host:'huggingface.co',group:'huggingface'},
 {id:'nvidia',name:'NVIDIA — المدونة الرسمية',url:'https://blogs.nvidia.com/blog/category/deep-learning/feed/',host:'blogs.nvidia.com',group:'nvidia'},
] as const;
export const configSchema=z.object({
 monitoring:z.boolean(),autoPublish:z.boolean(),pageId:z.uuid().nullable(),
 sourceIds:z.array(z.enum(['openai','google','huggingface','nvidia'])).max(4),
 pollMinutes:z.number().int().min(10).max(1440),dailyLimit:z.number().int().min(1).max(30),
 minIntervalMinutes:z.number().int().min(10).max(1440),
}).strict().refine(v=>!v.autoPublish||(v.monitoring&&v.pageId&&v.sourceIds.length>0),{message:'Select a Page and approved sources before enabling publishing'});
export type NewsConfig=z.infer<typeof configSchema>;
export const DEFAULT_CONFIG:NewsConfig={monitoring:false,autoPublish:false,pageId:null,sourceIds:[],pollMinutes:30,dailyLimit:5,minIntervalMinutes:60};
export const relevant=(title:string)=>/\b(ai|artificial intelligence|machine learning|deep learning|generative|language models?|llms?|gpt[\s-]?\d*|chatgpt|openai|anthropic|claude|gemini|copilot|sora|dall[\s-]?e|whisper|llama|mistral|qwen|deepseek|nemotron|groot|transformers?|diffusion|agents?|inference|embeddings?|fine[\s-]?tuning|robotics|neural)\b|الذكاء الاصطناعي|ذكاء اصطناعي|التعلم الآلي|التعلم العميق|نماذج لغوية|شات جي بي تي|جيميناي|كلود/i.test(title);
