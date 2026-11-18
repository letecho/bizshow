export interface MailMessage {
  to: string;
  subject: string;
  text: string;
}

/** メール送信。MAIL_DRIVER=log（既定・ログ出力のみ）| ses（Amazon SES v2） */
export interface Mailer {
  send(message: MailMessage): Promise<void>;
}

export function createLogMailer(log: (line: string) => void = console.log): Mailer {
  return {
    async send(message) {
      log(JSON.stringify({ type: 'mail', to: message.to, subject: message.subject, text: message.text }));
    },
  };
}

export function createSesMailer(options: { from: string; region?: string }): Mailer {
  // SES SDK は ses ドライバ選択時のみ読み込む
  let client: Promise<{ send: (message: MailMessage) => Promise<void> }> | undefined;
  const getClient = () =>
    (client ??= import('@aws-sdk/client-sesv2').then(({ SESv2Client, SendEmailCommand }) => {
      const ses = new SESv2Client({ region: options.region });
      return {
        async send(message: MailMessage) {
          await ses.send(
            new SendEmailCommand({
              FromEmailAddress: options.from,
              Destination: { ToAddresses: [message.to] },
              Content: {
                Simple: {
                  Subject: { Data: message.subject, Charset: 'UTF-8' },
                  Body: { Text: { Data: message.text, Charset: 'UTF-8' } },
                },
              },
            }),
          );
        },
      };
    }));
  return {
    async send(message) {
      await (await getClient()).send(message);
    },
  };
}

export function createMailerFromEnv(env: NodeJS.ProcessEnv = process.env): Mailer {
  const driver = env.MAIL_DRIVER || 'log';
  if (driver === 'log') return createLogMailer();
  if (driver === 'ses') {
    if (!env.MAIL_FROM) throw new Error('MAIL_FROM is required when MAIL_DRIVER=ses');
    return createSesMailer({ from: env.MAIL_FROM, region: env.AWS_REGION });
  }
  throw new Error(`Unknown MAIL_DRIVER: ${driver}`);
}
