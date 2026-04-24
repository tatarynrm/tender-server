import {
  Body,
  Container,
  Head,
  Heading,
  Hr,
  Html,
  Link,
  Preview,
  Section,
  Text,
  Img,
  Row,
  Column as Col,
} from '@react-email/components';
import * as React from 'react';

interface TenderNotificationProps {
  type:
    | 'TENDER_PLAN'
    | 'TENDER_ACTUAL'
    | 'TENDER_CHANGED'
    | 'TENDER_PROLONGATION'
    | 'TENDER_CLOSED'
    | 'TENDER_RESULT'
    | 'TENDER_MESSAGE_ANY';
  tenderId: string | number;
  domain: string;
  data: {
    date?: string;
    endDate?: string;
    cargo?: string;
    requirements?: string;
    route?: string;
    duration?: string;
    step?: string;
    buyout?: boolean;
    message?: string;
    isWinner?: boolean;
    lotInfo?: string;
    tenderType?: string; // e.g. "Редукціон", "Аукціон"
  };
}

export const TenderNotificationTemplate = ({
  type,
  tenderId,
  domain,
  data,
}: TenderNotificationProps) => {
  const tenderUrl = `${domain}/dashboard/tender/active`; // Or specific link if available

  const getHeaderInfo = () => {
    switch (type) {
      case 'TENDER_PLAN':
        return {
          title: 'Тендер заплановано',
          preview: `Повідомляємо про запланований тендер №${tenderId}`,
          mainText: `Повідомляємо, що ${data.date || ''} заплановано проведення тендеру №${tenderId}.`,
        };
      case 'TENDER_ACTUAL':
        return {
          title: `${data.tenderType || 'Редукціон'} запущено`,
          preview: `Запущено ${data.tenderType || 'редукціон'} №${tenderId}`,
          mainText: `Повідомляємо, що по замовленню №${tenderId} запущено ${data.tenderType || 'редукціон'}.`,
        };
      case 'TENDER_CHANGED':
        return {
          title: 'Зміни у тендері',
          preview: `В тендері №${tenderId} відбулися зміни`,
          mainText: `Повідомляємо Вам, що в тендері №${tenderId} відбулися зміни:`,
        };
      case 'TENDER_PROLONGATION':
        return {
          title: 'Пролонгація тендеру',
          preview: `По тендеру №${tenderId} змінено часові рамки`,
          mainText: `Повідомляємо Вам, що по тендеру №${tenderId} змінено часові рамки.`,
        };
      case 'TENDER_CLOSED':
        return {
          title: 'Прийом пропозицій завершено',
          preview: `Тендер №${tenderId} завершено`,
          mainText: `Повідомляємо, що прийом пропозицій по тендеру №${tenderId} завершено.`,
        };
      case 'TENDER_RESULT':
        return {
          title: 'Результати тендеру',
          preview: `Результати тендеру №${tenderId}: ${data.route}`,
          mainText: `Вдячні Вам за участь у тендері №${tenderId} (${data.route || ''}, ${data.cargo || ''}).`,
        };
      case 'TENDER_MESSAGE_ANY':
        return {
          title: 'Повідомлення по тендеру',
          preview: `Нове повідомлення по тендеру №${tenderId}`,
          mainText: `Повідомляємо Вам важливу інформацію по тендеру №${tenderId}:`,
        };
    }
  };

  const info = getHeaderInfo();

  return (
    <Html>
      <Head />
      <Preview>{info.preview}</Preview>
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
            <Heading style={h1}>{info.title}</Heading>
            <Text style={text}>{info.mainText}</Text>

            {(type === 'TENDER_CHANGED' ||
              type === 'TENDER_PROLONGATION' ||
              type === 'TENDER_MESSAGE_ANY') &&
              data.message && (
                <Section style={messageBox}>
                  <Text style={messageText}>{data.message}</Text>
                </Section>
              )}

            {type === 'TENDER_PROLONGATION' && data.endDate && (
              <Text style={highlightText}>
                Нова дата закінчення тендеру: <b>{data.endDate}</b>
              </Text>
            )}

            {type === 'TENDER_CLOSED' && (
              <Text style={subtext}>
                Просимо вас слідкувати за подальшими етапами тендеру у системі
                або звертати увагу на повідомлення, які надходитимуть на вашу
                електронну адресу.
              </Text>
            )}

            {type === 'TENDER_RESULT' && (
              <Section style={resultBox}>
                <Text style={resultBold}>
                  {data.isWinner
                    ? '🎉 Після ретельного розгляду всіх пропозицій було прийнято рішення обрати Вас переможцем!'
                    : 'По терезультатам тендеру було обрано переможцем іншого учасника.'}
                </Text>
                <Text style={subtext}>
                  Будемо раді бачити Вас у наступних тендерах і сподіваємося на
                  подальшу співпрацю.
                </Text>
              </Section>
            )}

            <Section style={btnContainer}>
              <Link style={button} href={tenderUrl}>
                {type === 'TENDER_RESULT'
                  ? 'Переглянути закупівлю'
                  : 'Переглянути тендер'}
              </Link>
            </Section>

            {/* Details Table */}
            {type !== 'TENDER_CLOSED' &&
              type !== 'TENDER_CHANGED' &&
              type !== 'TENDER_MESSAGE_ANY' && (
              <Section style={detailsContainer}>
                <Text style={detailsTitle}>Деталі тендеру:</Text>
                <Hr style={hr} />

                <Row style={detailRow}>
                  <Col style={detailColLabel} width="40%">
                    Вантаж:
                  </Col>
                  <Col style={detailColValue}>{data.cargo || '—'}</Col>
                </Row>
                <Row style={detailRow}>
                  <Col style={detailColLabel}>Вимоги ТЗ:</Col>
                  <Col style={detailColValue}>{data.requirements || '—'}</Col>
                </Row>
                <Row style={detailRow}>
                  <Col style={detailColLabel}>Маршрут:</Col>
                  <Col style={detailColValue}>{data.route || '—'}</Col>
                </Row>

                {data.duration && (
                  <Row style={detailRow}>
                    <Col style={detailColLabel}>Тривалість:</Col>
                    <Col style={detailColValue}>{data.duration}</Col>
                  </Row>
                )}

                {data.step && (
                  <Row style={detailRow}>
                    <Col style={detailColLabel}>Крок ставки:</Col>
                    <Col style={detailColValue}>{data.step}</Col>
                  </Row>
                )}

                {data.buyout !== undefined && (
                  <Row style={detailRow}>
                    <Col style={detailColLabel}>Можливість викупу:</Col>
                    <Col style={detailColValue}>
                      {data.buyout ? 'Так ✅' : 'Ні'}
                    </Col>
                  </Row>
                )}
              </Section>
            )}

            <Hr style={hr} />
            <Text style={footer}>
              Ви отримали це повідомлення, оскільки підписані на сповіщення ICT Logistics.<br />
              Керувати налаштуваннями або <Link href={`${domain}/dashboard/settings`} style={unsubscribeLink}>відписатися</Link> можна в особистому кабінеті.<br />
              <br />
              З повагою, команда ICT Logistics.<br />
              <Link href="https://ict.lviv.ua" style={footerLink}>ict.lviv.ua</Link>
            </Text>
          </Section>
        </Container>
      </Body>
    </Html>
  );
};

// Styles
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

const highlightText = {
  backgroundColor: '#eff6ff',
  borderRadius: '8px',
  color: '#1e40af',
  fontSize: '14px',
  padding: '12px',
  textAlign: 'center' as const,
  margin: '20px 0',
};

const messageBox = {
  backgroundColor: '#f8fafc',
  borderLeft: '4px solid #3b82f6',
  padding: '16px',
  margin: '20px 0',
};

const messageText = {
  color: '#1e293b',
  fontSize: '15px',
  fontWeight: '500',
  margin: '0',
  fontStyle: 'italic',
};

const resultBox = {
  padding: '16px 0',
};

const resultBold = {
  color: '#1e293b',
  fontSize: '16px',
  fontWeight: '700',
  lineHeight: '24px',
  margin: '0 0 8px',
};

const subtext = {
  color: '#64748b',
  fontSize: '14px',
  lineHeight: '20px',
  margin: '0',
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
  boxShadow: '0 4px 15px rgba(30, 64, 175, 0.3)',
};

const detailsContainer = {
  backgroundColor: '#fafafa',
  borderRadius: '12px',
  padding: '24px',
  margin: '24px 0',
};

const detailsTitle = {
  color: '#1e293b',
  fontSize: '12px',
  fontWeight: '800',
  textTransform: 'uppercase' as const,
  letterSpacing: '0.1em',
  margin: '0 0 10px',
};

const detailRow = {
  padding: '8px 0',
};

const detailColLabel = {
  color: '#64748b',
  fontSize: '13px',
  fontWeight: '600',
};

const detailColValue = {
  color: '#1e293b',
  fontSize: '13px',
  fontWeight: '700',
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
  margin: '24px 0 0',
};

const footerLink = {
  color: "#1e40af",
  textDecoration: "underline",
  fontWeight: "600",
};

const unsubscribeLink = {
  color: "#64748b",
  textDecoration: "underline",
} as const;
