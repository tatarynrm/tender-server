import {
  Html,
  Body,
  Container,
  Section,
  Heading,
  Text,
  Link,
  Img,
  Hr,
  Preview,
} from '@react-email/components';
import * as React from 'react';

interface ResetPasswordTemplateProps {
  domain: string;
  token: string;
}

export function ResetPasswordTemplate({
  domain,
  token,
}: ResetPasswordTemplateProps) {
  const resetLink = `${domain}/auth/new-password?token=${token}`;

  return (
    <Html>
      <Preview>Скидання паролю ICT Logistics</Preview>
      <Body style={main}>
        <Container style={container}>
          <Section style={header}>
            <Img
              src="https://tender.ict.lviv.ua/logo.png"
              width="140"
              height="40"
              alt="ICT Logistics"
              style={logo}
            />
          </Section>

          <Section style={content}>
            <Heading style={h1}>Скидання паролю</Heading>
            <Text style={text}>
              Ви отримали цей лист, оскільки ми отримали запит на скидання
              пароля для вашого облікового запису.
            </Text>

            <Section style={btnContainer}>
              <Link style={button} href={resetLink}>
                Змінити пароль
              </Link>
            </Section>

            <Text style={subtext}>
              Це посилання валідне протягом 1 години. Якщо ви не надсилали цей
              запит, ви можете просто проігнорути даний лист.
            </Text>

            <Hr style={hr} />

            <Text style={footer}>
              Ви отримали це повідомлення у відповідь на запит безпеки вашого
              облікового запису ICT Logistics.
              <br />
              Керувати налаштуваннями або{' '}
              <Link
                href={`${domain}/dashboard/settings`}
                style={unsubscribeLink}
              >
                відписатися
              </Link>{' '}
              можна в особистому кабінеті.
              <br />
              <br />
              З повагою, команда ICT Logistics.
              <br />
              <Link href="https://ict.lviv.ua" style={footerLink}>
                ict.lviv.ua
              </Link>
            </Text>
          </Section>
        </Container>
      </Body>
    </Html>
  );
}

const main = {
  backgroundColor: '#f4f7f9',
  fontFamily:
    '-apple-system,BlinkMacSystemFont,"Segoe UI",Roboto,Oxygen-Sans,Ubuntu,Cantarell,"Helvetica Neue",sans-serif',
};

const container = {
  margin: '0 auto',
  padding: '20px 0 48px',
  width: '580px',
  maxWidth: '100%',
};

const header = {
  padding: '32px',
  textAlign: 'center' as const,
};

const logo = {
  margin: '0 auto',
};

const content = {
  backgroundColor: '#ffffff',
  borderRadius: '16px',
  padding: '40px',
  boxShadow: '0 4px 12px rgba(0,0,0,0.05)',
};

const h1 = {
  color: '#1e293b',
  fontSize: '24px',
  fontWeight: '800',
  lineHeight: '1.2',
  margin: '0 0 16px',
  textAlign: 'center' as const,
  textTransform: 'uppercase' as const,
  letterSpacing: '0.05em',
};

const text = {
  color: '#475569',
  fontSize: '16px',
  lineHeight: '24px',
  textAlign: 'center' as const,
  margin: '0 0 24px',
};

const btnContainer = {
  textAlign: 'center' as const,
  margin: '32px 0 40px',
};

const button = {
  backgroundColor: '#1e40af',
  borderRadius: '12px',
  color: '#fff',
  fontSize: '14px',
  fontWeight: '800',
  textDecoration: 'none',
  textAlign: 'center' as const,
  display: 'inline-block',
  padding: '18px 32px',
  textTransform: 'uppercase' as const,
  letterSpacing: '0.1em',
};

const subtext = {
  color: '#64748b',
  fontSize: '13px',
  lineHeight: '20px',
  textAlign: 'center' as const,
  margin: '0',
};

const hr = {
  borderColor: '#e2e8f0',
  margin: '24px 0',
};

const footer = {
  color: '#94a3b8',
  fontSize: '12px',
  lineHeight: '18px',
  textAlign: 'center' as const,
};

const footerLink = {
  color: '#1e40af',
  textDecoration: 'underline',
  fontWeight: '600',
};

const unsubscribeLink = {
  color: '#64748b',
  textDecoration: 'underline',
};
