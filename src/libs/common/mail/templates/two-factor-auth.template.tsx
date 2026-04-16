import { 
  Html, 
  Body, 
  Container, 
  Section, 
  Heading, 
  Text, 
  Img, 
  Hr, 
  Preview,
  Link
} from '@react-email/components';
import * as React from 'react';

interface TwoFactorAuthTemplateProps {
  token: string;
}

export function TwoFactorAuthTemplate({
  token,
}: TwoFactorAuthTemplateProps) {
  return (
    <Html>
      <Preview>Код безпеки ICT Logistics</Preview>
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
            <Heading style={h1}>Код підтвердження</Heading>
            <Text style={text}>
               Для входу в обліковий запис використовуйте наступний код двофакторної автентифікації:
            </Text>

            <Section style={codeContainer}>
               <Text style={codeText}>{token}</Text>
            </Section>

            <Text style={subtext}>
              Цей код валідний протягом 10 хвилин. Якщо ви не намагалися увійти в систему, негайно змініть свій пароль.
            </Text>

            <Hr style={hr} />
            
            <Text style={footer}>
              Ви отримали це повідомлення з міркувань безпеки вашого облікового запису ICT Logistics.<br />
              З повагою, команда ICT Logistics.<br />
              <Link href="https://ict.lviv.ua" style={footerLink}>ict.lviv.ua</Link>
            </Text>
          </Section>
        </Container>
      </Body>
    </Html>
  );
}

const main = {
  backgroundColor: "#f4f7f9",
  fontFamily: '-apple-system,BlinkMacSystemFont,"Segoe UI",Roboto,Oxygen-Sans,Ubuntu,Cantarell,"Helvetica Neue",sans-serif',
};

const container = {
  margin: "0 auto",
  padding: "20px 0 48px",
  width: "580px",
  maxWidth: "100%",
};

const header = {
  padding: "32px",
  textAlign: "center" as const,
};

const logo = {
  margin: "0 auto",
};

const content = {
  backgroundColor: "#ffffff",
  borderRadius: "16px",
  padding: "40px",
  boxShadow: "0 4px 12px rgba(0,0,0,0.05)",
};

const h1 = {
  color: "#1e293b",
  fontSize: "24px",
  fontWeight: "800",
  lineHeight: "1.2",
  margin: "0 0 16px",
  textAlign: "center" as const,
  textTransform: "uppercase" as const,
  letterSpacing: "0.05em",
};

const text = {
  color: "#475569",
  fontSize: "16px",
  lineHeight: "24px",
  textAlign: "center" as const,
  margin: "0 0 24px",
};

const codeContainer = {
  backgroundColor: "#f8fafc",
  borderRadius: "12px",
  padding: "24px",
  margin: "32px 0",
  textAlign: "center" as const,
  border: "1px dashed #cbd5e1",
};

const codeText = {
  color: "#1e40af",
  fontSize: "36px",
  fontWeight: "800",
  letterSpacing: "12px",
  margin: "0",
};

const subtext = {
  color: "#64748b",
  fontSize: "13px",
  lineHeight: "20px",
  textAlign: "center" as const,
  margin: "0",
};

const hr = {
  borderColor: "#e2e8f0",
  margin: "24px 0",
};

const footer = {
  color: "#94a3b8",
  fontSize: "12px",
  lineHeight: "18px",
  textAlign: "center" as const,
};

const footerLink = {
  color: "#1e40af",
  textDecoration: "underline",
  fontWeight: "600",
};
