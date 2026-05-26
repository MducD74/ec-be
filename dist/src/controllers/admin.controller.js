import axios from "axios";
const aiClient = axios.create({
    baseURL: "http://localhost:8000",
    timeout: 5000,
});
function getErrorMessage(error) {
    return error instanceof Error ? error.message : "Request failed";
}
export class AdminController {
    async trainAiModel(_req, res, _next) {
        try {
            void aiClient.post("/train").catch((error) => {
                console.error("AI training request failed:", getErrorMessage(error));
            });
            return res.status(202).json({
                success: true,
                message: "Đang tiến hành huấn luyện mô hình",
            });
        }
        catch (error) {
            return res.status(500).json({
                success: false,
                message: getErrorMessage(error),
            });
        }
    }
}
