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
  Link,
  Row,
  Column
} from '@react-email/components';
import * as React from 'react';

export function SuccessfulPreRegistrationAccountTemplate({ 
  name,
  domain,
  showPasswordHint = false
}: { 
  name?: string;
  domain: string;
  showPasswordHint?: boolean;
}) {
  return (
    <Html>
      <Preview>Ваш аккаунт в ICTender активовано! 🚀</Preview>
      <Body style={main}>
        <Container style={container}>
          {/* Header Gradient Block */}
          <Section style={headerSection}>
            <Img
              src={`${domain}/logo.png`}
              width="160"
              height="45"
              alt="ICTender"
              style={logo}
            />
          </Section>

          <Section style={whiteCard}>
            <Heading style={h1}>Вітаємо{name ? `, ${name}` : ''}!</Heading>
            
            <Section style={iconCircle}>
               <Text style={iconEmoji}>✅</Text>
            </Section>

            <Text style={text}>
               Ваш обліковий запис успішно пройшов верифікацію нашими менеджерами. Тепер вам доступний повний функціонал системи тендерів та логістики.
            </Text>

            <Section style={infoBox}>
               <Row>
                 <Column style={infoItem}>
                   <Text style={infoLabel}>СТАТУС</Text>
                   <Text style={infoValue}>АКТИВНИЙ</Text>
                 </Column>
                 <Column style={infoItem}>
                   <Text style={infoLabel}>ДОСТУП</Text>
                   <Text style={infoValue}>ПОВНИЙ</Text>
                 </Column>
               </Row>
            </Section>

            <Section style={btnContainer}>
              <Link style={button} href={`${domain}/auth/login`}>
                Увійти до кабінету
              </Link>
            </Section>

            <Text style={subtext}>
              Використовуйте свої реєстраційні дані (Email та пароль) для авторизації в системі.
              {showPasswordHint && (
                <>
                  <br />
                  <br />
                  Якщо ви забули пароль — скористайтеся функцією <strong>«Забули пароль?»</strong> на сторінці входу, щоб встановити власний.
                </>
              )}
            </Text>

            <Hr style={hr} />
            
            <Section style={footerSection}>
              <Text style={footerText}>
                Ви отримали цей лист, оскільки ваша реєстрація на платформі ICTender була схвалена адміністратором.<br />
                <br />
                <strong>Команда ICTender</strong><br />
                Цифрова екосистема логістики
              </Text>
              
              <Row style={linksRow}>
                <Column align="center">
                  <Link href="https://ict.lviv.ua" style={footerLink}>Сайт компанії</Link>
                  <span style={dot}>•</span>
                  <Link href="mailto:support@ict.lviv.ua" style={footerLink}>Підтримка</Link>
                </Column>
              </Row>
            </Section>
          </Section>
          
          <Text style={legalText}>
            © 2024 ICT Logistics. Всі права захищені.
          </Text>
        </Container>
      </Body>
    </Html>
  );
}

const main = {
  backgroundColor: "#f0f4f8",
  fontFamily: 'Inter, -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif',
  padding: "40px 0",
};

const container = {
  margin: "0 auto",
  width: "600px",
  maxWidth: "100%",
};

const headerSection = {
  backgroundColor: "#0f172a",
  borderRadius: "24px 24px 0 0",
  padding: "40px",
  textAlign: "center" as const,
};

const logo = {
  margin: "0 auto",
};

const whiteCard = {
  backgroundColor: "#ffffff",
  borderRadius: "0 0 24px 24px",
  padding: "48px 40px",
  boxShadow: "0 20px 25px -5px rgba(0, 0, 0, 0.1), 0 10px 10px -5px rgba(0, 0, 0, 0.04)",
};

const h1 = {
  color: "#0f172a",
  fontSize: "28px",
  fontWeight: "800",
  lineHeight: "1.2",
  margin: "0 0 24px",
  textAlign: "center" as const,
  letterSpacing: "-0.02em",
};

const iconCircle = {
  width: "64px",
  height: "64px",
  backgroundColor: "#ecfdf5",
  borderRadius: "32px",
  margin: "0 auto 24px",
  display: "flex",
  alignItems: "center",
  justifyContent: "center",
};

const iconEmoji = {
  fontSize: "32px",
  margin: "0",
  textAlign: "center" as const,
  lineHeight: "64px",
};

const text = {
  color: "#475569",
  fontSize: "16px",
  lineHeight: "26px",
  textAlign: "center" as const,
  margin: "0 0 32px",
};

const infoBox = {
  backgroundColor: "#f8fafc",
  borderRadius: "16px",
  padding: "24px",
  margin: "0 0 32px",
  border: "1px solid #e2e8f0",
};

const infoItem = {
  textAlign: "center" as const,
};

const infoLabel = {
  color: "#94a3b8",
  fontSize: "11px",
  fontWeight: "700",
  letterSpacing: "0.1em",
  margin: "0 0 4px",
  textTransform: "uppercase" as const,
};

const infoValue = {
  color: "#0f172a",
  fontSize: "15px",
  fontWeight: "800",
  margin: "0",
};

const btnContainer = {
  textAlign: "center" as const,
  margin: "0 0 24px",
};

const button = {
  backgroundColor: "#10b981",
  borderRadius: "14px",
  color: "#fff",
  fontSize: "16px",
  fontWeight: "700",
  textDecoration: "none",
  textAlign: "center" as const,
  display: "inline-block",
  padding: "20px 40px",
  boxShadow: "0 10px 15px -3px rgba(16, 185, 129, 0.3)",
};

const subtext = {
  color: "#64748b",
  fontSize: "13px",
  lineHeight: "20px",
  textAlign: "center" as const,
  margin: "0",
};

const hr = {
  borderColor: "#f1f5f9",
  margin: "40px 0",
};

const footerSection = {
  textAlign: "center" as const,
};

const footerText = {
  color: "#64748b",
  fontSize: "14px",
  lineHeight: "24px",
  margin: "0 0 24px",
};

const linksRow = {
  width: "auto",
  margin: "0 auto",
};

const footerLink = {
  color: "#10b981",
  textDecoration: "none",
  fontWeight: "600",
  fontSize: "13px",
};

const dot = {
  color: "#cbd5e1",
  margin: "0 12px",
};

const legalText = {
  color: "#94a3b8",
  fontSize: "12px",
  textAlign: "center" as const,
  marginTop: "24px",
};

