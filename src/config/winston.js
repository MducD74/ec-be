import winston from "winston";
import DailyRotateFile from "winston-daily-rotate-file";

const AppConf = {
  logFile: {
    folder: 'logs',
    errorFile: 'error-%DATE%.log',
    datePattern: 'YYYY-MM-DD',
    zippedArchive: true,
    handleExceptions: true,
    maxSize: '100m',
    maxFiles: '30d'
  },
}

const {format} = winston;
const {combine, label, timestamp, printf} = format;

const filter = format((info) => {
  const {message, stack} = info;
  if (stack) {
    return {
      ...info,
      message: JSON.stringify(message),
      stack
    };
  }

  return {
    ...info,
    message:
      typeof info.message === "object"
        ? JSON.stringify(info.message)
        : info.message
  };
});

const myFormat = printf(
  ({level, message, label: _label, timestamp: _timestamp, stack}) => {
    return `[${_timestamp}] [${_label.toUpperCase()}] [${level.toUpperCase()}]: ${message}${
      stack ? `. ${stack}` : ""
    }`;
  }
);

export const container = new winston.Container();

function createFormat(_label) {
  return combine(
    timestamp({
      format: "YYYY-MM-DD HH:mm:ss.SSS"
    }),
    label({label: _label}),
    filter(),
    myFormat
  );
}

function createLoggerOptions(loggerName, opts = {}) {
  const rs = {
    format: createFormat(loggerName),
    transports: [
      new DailyRotateFile({
        filename: `${AppConf.logFile.folder}`.concat(
          `/${loggerName}-%DATE%.log`
        ),
        datePattern: AppConf.logFile.datePattern,
        zippedArchive: AppConf.logFile.zippedArchive,
        handleExceptions: AppConf.logFile.handleExceptions,
        maxSize: AppConf.logFile.maxSize,
        maxFiles: AppConf.logFile.maxFiles,
        level: "info",
        ...opts
      })
    ]
  };

  if (opts.isSeparateError) {
    rs.transports.push(
      new DailyRotateFile({
        filename: `${AppConf.logFile.folder}`.concat(
          `/${loggerName}-error-%DATE%.log`
        ),
        datePattern: AppConf.logFile.datePattern,
        zippedArchive: AppConf.logFile.zippedArchive,
        handleExceptions: AppConf.logFile.handleExceptions,
        maxSize: AppConf.logFile.maxSize,
        maxFiles: AppConf.logFile.maxFiles,
        level: "error",
        ...opts
      })
    );
  }

  if (process.env.NODE_ENV === "development") {
    rs.transports.push(
      new winston.transports.Console({
        level: "debug",
        handleExceptions: true,
        json: false,
        colorize: true,
        format: myFormat
      })
    );
  }

  return rs;
}

container.add("app", {
  ...createLoggerOptions("app", {isSeparateError: true}),
  exceptionHandlers: [
    new DailyRotateFile({
      filename: `${AppConf.logFile.folder}`.concat("/exception-%DATE%.log"),
      datePattern: AppConf.logFile.datePattern,
      zippedArchive: AppConf.logFile.zippedArchive,
      handleExceptions: AppConf.logFile.handleExceptions,
      maxSize: AppConf.logFile.maxSize,
      maxFiles: AppConf.logFile.maxFiles,
      level: "info"
    })
  ]
});
container.add("http", createLoggerOptions("http"));
container.add("ai-service", createLoggerOptions("ai-service"));

export const appLog = container.get("app");
export const aiServiceLog = container.get("ai-service");
export const httpLog = container.get("http");

export const httpStream = {
  write: (message) => {
    httpLog.info(message);
  }
};
