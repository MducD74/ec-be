import crypto from "crypto";
import qs from "qs";
import { appLog } from "../config/winston.js";
// ─── Helpers ──────────────────────────────────────────────────────────────────
function getVnPayConfig() {
    const required = {
        VNP_TMNCODE: process.env.VNP_TMNCODE,
        VNP_HASHSECRET: process.env.VNP_HASHSECRET,
        VNP_RETURNURL: process.env.VNP_RETURNURL,
        VNP_IPNURL: process.env.VNP_IPNURL,
        VNP_URL: process.env.VNP_URL,
    };
    for (const [key, value] of Object.entries(required)) {
        if (!value) {
            throw new Error(`Missing required environment variable: ${key}`);
        }
    }
    return {
        tmnCode: required.VNP_TMNCODE,
        hashSecret: required.VNP_HASHSECRET,
        returnUrl: required.VNP_RETURNURL,
        ipnUrl: required.VNP_IPNURL,
        paymentUrl: required.VNP_URL,
    };
}
function formatVnPayDate(date) {
    const pad = (n) => String(n).padStart(2, "0");
    return (`${date.getFullYear()}` +
        `${pad(date.getMonth() + 1)}` +
        `${pad(date.getDate())}` +
        `${pad(date.getHours())}` +
        `${pad(date.getMinutes())}` +
        `${pad(date.getSeconds())}`);
}
function sortObject(params) {
    const sorted = {};
    const keys = Object.keys(params).sort();
    for (const key of keys) {
        sorted[key] = encodeURIComponent(params[key]).replace(/%20/g, "+");
    }
    return sorted;
}
function buildSignedQuery(params, hashSecret) {
    const sorted = sortObject(params);
    const signData = qs.stringify(sorted, {
        encode: false,
    });
    const secureHash = crypto
        .createHmac("sha512", hashSecret)
        .update(Buffer.from(signData, "utf8"))
        .digest("hex");
    const query = `${signData}&vnp_SecureHash=${secureHash}`;
    return {
        query,
        secureHash,
    };
}
function extractSecureHash(params) {
    const { vnp_SecureHash, vnp_SecureHashType, ...rest } = params;
    return {
        secureHash: vnp_SecureHash ?? "",
        paramsWithoutHash: rest,
    };
}
function responseCodeToMessage(code) {
    const messages = {
        "00": "Giao dịch thành công",
        "07": "Trừ tiền thành công. Giao dịch bị nghi ngờ (liên quan tới lừa đảo, giao dịch bất thường).",
        "09": "Thẻ/Tài khoản chưa đăng ký dịch vụ InternetBanking tại ngân hàng.",
        "10": "Khách hàng xác thực thông tin thẻ/tài khoản không đúng quá 3 lần.",
        "11": "Đã hết hạn chờ thanh toán. Vui lòng thực hiện lại giao dịch.",
        "12": "Thẻ/Tài khoản bị khóa.",
        "13": "Quý khách nhập sai mật khẩu xác thực giao dịch (OTP).",
        "24": "Khách hàng hủy giao dịch.",
        "51": "Tài khoản không đủ số dư để thực hiện giao dịch.",
        "65": "Tài khoản đã vượt quá hạn mức giao dịch trong ngày.",
        "75": "Ngân hàng thanh toán đang bảo trì.",
        "79": "KH nhập sai mật khẩu thanh toán quá số lần quy định.",
        "99": "Lỗi không xác định.",
    };
    return messages[code] ?? `Lỗi không xác định (${code})`;
}
// ─── VnPayService ─────────────────────────────────────────────────────────────
export class VnPayService {
    createPaymentUrl(params) {
        const config = getVnPayConfig();
        const now = new Date();
        const expireDate = new Date(now.getTime() + 15 * 60 * 1000); // 15 phut
        const vnpParams = {
            vnp_Version: "2.1.0",
            vnp_Command: "pay",
            vnp_TmnCode: config.tmnCode,
            vnp_Locale: params.locale ?? "vn",
            vnp_CurrCode: "VND",
            vnp_TxnRef: params.orderId,
            vnp_OrderInfo: params.orderInfo,
            vnp_OrderType: "other",
            vnp_Amount: String(Math.round(params.amount) * 100),
            vnp_ReturnUrl: config.returnUrl,
            vnp_IpAddr: params.ipAddr,
            vnp_CreateDate: formatVnPayDate(now),
            vnp_ExpireDate: formatVnPayDate(expireDate),
        };
        if (params.bankCode) {
            vnpParams.vnp_BankCode = params.bankCode;
        }
        const { query } = buildSignedQuery(vnpParams, config.hashSecret);
        return `${config.paymentUrl}?${query}`;
    }
    verifySignature(params) {
        const config = getVnPayConfig();
        const { secureHash, paramsWithoutHash } = extractSecureHash(params);
        if (!secureHash)
            return false;
        const { secureHash: computedHash } = buildSignedQuery(paramsWithoutHash, config.hashSecret);
        return secureHash.toLowerCase() === computedHash.toLowerCase();
    }
    verifyReturnUrl(query) {
        const isValid = this.verifySignature(query);
        const responseCode = query.vnp_ResponseCode ?? "";
        const transactionRef = query.vnp_TxnRef ?? "";
        const rawAmount = query.vnp_Amount ?? "0";
        const amount = Math.round(Number(rawAmount) / 100);
        appLog.info("[VnPay] Return URL received", {
            transactionRef,
            responseCode,
            isValid,
        });
        return {
            isValid,
            transactionRef,
            responseCode,
            transactionNo: query.vnp_TransactionNo ?? "",
            amount,
            bankCode: query.vnp_BankCode ?? "",
            bankTransactionNo: query.vnp_BankTranNo ?? "",
            payDate: query.vnp_PayDate ?? "",
            message: responseCodeToMessage(responseCode),
        };
    }
    verifyIpn(query) {
        const isValid = this.verifySignature(query);
        const responseCode = query.vnp_ResponseCode ?? "";
        const transactionRef = query.vnp_TxnRef ?? "";
        const rawAmount = query.vnp_Amount ?? "0";
        const amount = Math.round(Number(rawAmount) / 100);
        appLog.info("[VnPay] IPN received", {
            transactionRef,
            responseCode,
            isValid,
            transactionNo: query.vnp_TransactionNo,
        });
        return {
            isValid,
            transactionRef,
            responseCode,
            transactionNo: query.vnp_TransactionNo ?? "",
            amount,
            bankCode: query.vnp_BankCode ?? "",
            bankTransactionNo: query.vnp_BankTranNo ?? "",
            payDate: query.vnp_PayDate ?? "",
            message: responseCodeToMessage(responseCode),
        };
    }
}
export const vnPayService = new VnPayService();
