import axios from "axios";
import { Queue, Worker } from "bullmq";
const AI_TRAINING_QUEUE_NAME = "ai-training-queue";
const CRON_TRAIN_JOB_NAME = "cron-train";
const MANUAL_TRAIN_JOB_NAME = "manual-train";
const AI_TRAINING_API_URL = process.env.AI_TRAINING_API_URL ?? process.env.AI_SERVICE_TRAIN_URL ?? "http://127.0.0.1:8000/train";
function getRedisConnection() {
    const redisUrl = process.env.REDIS_URL;
    if (!redisUrl) {
        return {
            host: process.env.REDIS_HOST ?? "127.0.0.1",
            port: Number(process.env.REDIS_PORT ?? 6379),
            password: process.env.REDIS_PASSWORD || undefined,
            db: Number(process.env.REDIS_DB ?? 0),
        };
    }
    const parsedUrl = new URL(redisUrl);
    return {
        host: parsedUrl.hostname,
        port: Number(parsedUrl.port || 6379),
        username: parsedUrl.username || undefined,
        password: parsedUrl.password || undefined,
        db: Number(parsedUrl.pathname.replace("/", "") || 0),
    };
}
const defaultJobOptions = {
    attempts: 3,
    backoff: {
        type: "exponential",
        delay: 5000,
    },
    removeOnComplete: 1000,
    removeOnFail: 1000,
};
const redisConnection = getRedisConnection();
export const aiTrainingQueue = new Queue(AI_TRAINING_QUEUE_NAME, {
    connection: redisConnection,
    defaultJobOptions,
});
export const aiTrainingWorker = new Worker(AI_TRAINING_QUEUE_NAME, async () => {
    try {
        const response = await axios.post(AI_TRAINING_API_URL, undefined, {
            timeout: 0,
        });
        const responseBody = response.data;
        const status = typeof responseBody.status === "string" ? responseBody.status.toLowerCase() : undefined;
        if (responseBody.success === false || status === "error" || status === "failed") {
            throw new Error(responseBody.message ?? `AI training API reported failure: ${JSON.stringify(responseBody.error ?? responseBody)}`);
        }
        return responseBody;
    }
    catch (error) {
        if (axios.isAxiosError(error)) {
            const detail = error.response?.data ?? error.message;
            throw new Error(`AI training API request failed: ${JSON.stringify(detail)}`);
        }
        throw error;
    }
}, {
    connection: redisConnection,
});
export async function addManualTrainingJob() {
    return aiTrainingQueue.add(MANUAL_TRAIN_JOB_NAME, {
        requestedAt: new Date().toISOString(),
        source: "admin",
    });
}
export async function scheduleAiTrainingCronJob() {
    await aiTrainingQueue.upsertJobScheduler("ai-training-scheduler", {
        pattern: "*/5 * * * *",
    }, {
        name: CRON_TRAIN_JOB_NAME,
        data: {
            source: "cron",
        },
    });
    console.log("✅ Đã thiết lập Upsert Cron Job cho AI Worker thành công!");
}
