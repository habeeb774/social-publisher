import {z} from 'zod';
export {canonicalUrl,hash,normalizedTitle,similarity,speculative,validArabicPost,retryDelaySeconds,riyadhDay} from '../elon-news/model';

// Fixed, tested primary sources and established technical journalism. No mirrors or arbitrary URLs.
export const SOURCES=[
 {id:'openai',name:'OpenAI — المصدر الرسمي',url:'https://openai.com/news/rss.xml',host:'openai.com',group:'openai'},
 {id:'google',name:'Google AI — المصدر الرسمي',url:'https://blog.google/innovation-and-ai/technology/ai/rss/',host:'blog.google',group:'google'},
 {id:'huggingface',name:'Hugging Face — المدونة الرسمية',url:'https://huggingface.co/blog/feed.xml',host:'huggingface.co',group:'huggingface'},
 {id:'nvidia',name:'NVIDIA — المدونة الرسمية',url:'https://blogs.nvidia.com/blog/category/deep-learning/feed/',host:'blogs.nvidia.com',group:'nvidia'},
 {id:'anthropic',name:'Anthropic وClaude — غرفة الأخبار الرسمية',url:'https://www.anthropic.com/news',host:'anthropic.com',group:'anthropic'},
 {id:'gemini',name:'Gemini — أخبار Google الرسمية',url:'https://blog.google/products-and-platforms/products/gemini/rss/',host:'blog.google',group:'google'},
 {id:'techcrunch',name:'TechCrunch AI — صحافة تقنية',url:'https://techcrunch.com/category/artificial-intelligence/feed/',host:'techcrunch.com',group:'techcrunch'},
 {id:'ars',name:'Ars Technica — صحافة تقنية',url:'https://feeds.arstechnica.com/arstechnica/index',host:'arstechnica.com',group:'ars'},
 {id:'aitnews',name:'البوابة العربية للأخبار التقنية',url:'https://aitnews.com/feed/',host:'aitnews.com',group:'aitnews'},
] as const;
export const configSchema=z.object({
 monitoring:z.boolean(),autoPublish:z.boolean(),pageId:z.uuid().nullable(),
 verificationMode:z.enum(['corroborated','approved_source']).default('corroborated'),
 sourceIds:z.array(z.enum(['openai','google','huggingface','nvidia','anthropic','gemini','techcrunch','ars','aitnews'])).max(SOURCES.length),
 pollMinutes:z.number().int().min(10).max(1440),dailyLimit:z.number().int().min(1).max(30),
 minIntervalMinutes:z.number().int().min(10).max(1440),
}).strict().refine(v=>!v.autoPublish||(v.monitoring&&v.pageId&&v.sourceIds.length>0),{message:'Select a Page and approved sources before enabling publishing'});
export type NewsConfig=z.infer<typeof configSchema>;
export const DEFAULT_CONFIG:NewsConfig={monitoring:false,autoPublish:false,pageId:null,verificationMode:'corroborated',sourceIds:[],pollMinutes:30,dailyLimit:5,minIntervalMinutes:60};
export const relevant=(text:string)=>/\b(ai|artificial intelligence|machine learning|deep learning|generative|language models?|llms?|gpt[\s-]?\d*|chatgpt|openai|anthropic|claude|x[.\s-]?ai|grok|gemini|copilot|sora|dall[\s-]?e|whisper|llama|mistral|qwen|deepseek|nemotron|groot|perplexity|cursor|windsurf|notebooklm|jules|midjourney|firefly|runway|kling|veo|elevenlabs|suno|udio|canva|heygen|synthesia|recraft|lovable|bolt\.new|n8n|crewai|langchain|ollama|lm studio|dify|flowise|transformers?|diffusion|agents?|inference|embeddings?|fine[\s-]?tuning|robotics|neural)\b|الذكاء الاصطناعي|ذكاء اصطناعي|التعلم الآلي|التعلم العميق|نماذج لغوية|شات جي بي تي|جيميناي|جيمني|كلود|أنثروبيك|انثروبيك|جروك|غروك|بيربلكسيتي|ميدجورني|كانفا/i.test(text);
