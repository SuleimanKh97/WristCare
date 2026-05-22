import cron from 'node-cron';
import nodemailer from 'nodemailer';
import pool from '../db/pool';

// Initialize the weekly CRON scheduled job
export function initReportCron() {
  console.log('⏰ Weekly Health Report CRON Service Initialized.');
  
  // Schedule a task to run every Monday at 8:00 AM ('0 8 * * 1')
  cron.schedule('0 8 * * 1', async () => {
    console.log('⏰ CRON Triggered: Executing weekly health report generation...');
    try {
      await generateAndSendWeeklyReports();
    } catch (err) {
      console.error('Error during scheduled report generation:', err);
    }
  });
}

// Stats interface
interface PatientStats {
  patientId: string;
  firstName: string;
  lastName: string;
  avgHeartRate: number;
  minSpo2: number;
  avgSystolic: number;
  avgDiastolic: number;
  alertCount: number;
}

// Generate reports and send to family contacts
export async function generateAndSendWeeklyReports(): Promise<any[]> {
  const connection = await pool.getConnection();
  const resultsLog: any[] = [];
  
  try {
    // 1. Fetch all Premium patients
    const [patients] = await connection.execute(
      "SELECT id, first_name, last_name FROM patients WHERE subscription_tier = 'Premium'"
    );
    const premiumPatients = patients as any[];
    console.log(`📊 Found ${premiumPatients.length} Premium patients for weekly reporting.`);

    if (premiumPatients.length === 0) {
      console.log('ℹ️ No Premium patients found. Skipping report dispatch.');
      return [];
    }

    // 2. Configure NodeMailer Transporter (Dynamic Ethereal Test Account)
    let transporter: nodemailer.Transporter;
    let testAccount: any = null;
    
    try {
      testAccount = await nodemailer.createTestAccount();
      transporter = nodemailer.createTransport({
        host: testAccount.smtp.host,
        port: testAccount.smtp.port,
        secure: testAccount.smtp.secure,
        auth: {
          user: testAccount.user,
          pass: testAccount.pass
        }
      });
      console.log(`📧 Nodemailer initialized via Ethereal SMTP: user=${testAccount.user}`);
    } catch (mailErr) {
      console.error('Failed to create Ethereal SMTP test account. Falling back to local logger...', mailErr);
      return [];
    }

    // 3. Process each Premium patient's stats
    for (const patient of premiumPatients) {
      const pId = patient.id;
      const patientName = `${patient.first_name} ${patient.last_name}`;

      // A. Fetch vitals statistics over the last 7 days
      const [vitalRows] = await connection.execute(
        `SELECT 
           AVG(heart_rate) AS avg_hr, 
           MIN(spo2) AS min_spo2, 
           AVG(systolic_bp) AS avg_sys, 
           AVG(diastolic_bp) AS avg_dia 
         FROM vitals_telemetry 
         WHERE patient_id = ? AND measured_at >= DATE_SUB(NOW(), INTERVAL 7 DAY)`,
        [pId]
      );
      
      const statsObj = (vitalRows as any[])[0];
      if (!statsObj || statsObj.avg_hr === null) {
        console.log(`ℹ️ No vitals recorded in the last 7 days for ${patientName}. Skipping weekly report.`);
        continue;
      }

      // B. Fetch alert count over the last 7 days
      const [alertRows] = await connection.execute(
        `SELECT COUNT(*) AS count 
         FROM alert_history 
         WHERE patient_id = ? AND triggered_at >= DATE_SUB(NOW(), INTERVAL 7 DAY)`,
        [pId]
      );
      const alertCount = (alertRows as any[])[0].count || 0;

      const patientStats: PatientStats = {
        patientId: pId,
        firstName: patient.first_name,
        lastName: patient.last_name,
        avgHeartRate: Math.round(Number(statsObj.avg_hr || 0)),
        minSpo2: Math.round(Number(statsObj.min_spo2 || 0)),
        avgSystolic: Math.round(Number(statsObj.avg_sys || 0)),
        avgDiastolic: Math.round(Number(statsObj.avg_dia || 0)),
        alertCount
      };

      // C. Query linked family contacts
      const [familyRows] = await connection.execute(
        `SELECT u.email, u.name, fm.relationship 
         FROM family_members fm
         INNER JOIN users u ON fm.user_id = u.id
         WHERE fm.patient_id = ?`,
        [pId]
      );
      const familyContacts = familyRows as any[];

      if (familyContacts.length === 0) {
        console.log(`ℹ️ Patient ${patientName} has no linked family contacts. Stats computed but email skipped.`);
        continue;
      }

      // D. Build premium dark-themed HTML report
      const emailHtml = buildReportHtml(patientName, patientStats);

      // E. Dispatch emails to all linked family members
      for (const contact of familyContacts) {
        const mailOptions = {
          from: '"WristCare Health Service" <noreply@wristcare.com>',
          to: contact.email,
          subject: `📊 Weekly Health Report: ${patientName} (${new Date().toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })})`,
          html: emailHtml
        };

        const info = await transporter.sendMail(mailOptions);
        const previewUrl = nodemailer.getTestMessageUrl(info);
        
        console.log(`🚀 Weekly report sent successfully to family member: ${contact.name} (${contact.email}) for patient ${patientName}`);
        if (previewUrl) {
          console.log(`🔗 Preview Email: ${previewUrl}`);
        }

        resultsLog.push({
          patient: patientName,
          recipient: contact.name,
          email: contact.email,
          previewUrl: previewUrl || 'no-preview-available',
          stats: patientStats
        });
      }
    }

    return resultsLog;
  } catch (err) {
    console.error('Error generating weekly reports:', err);
    throw err;
  } finally {
    connection.release();
  }
}

// Elegant Dark-Glassmorphic Styled HTML Email Template Builder
function buildReportHtml(patientName: string, stats: PatientStats): string {
  const dateStr = new Date().toLocaleDateString('ar-JO', { weekday: 'long', year: 'numeric', month: 'long', day: 'numeric' });
  const statusSummary = stats.alertCount === 0 
    ? 'ممتازة ومستقرة' 
    : stats.alertCount <= 2 
    ? 'مستقرة بشكل عام مع بعض التنبيهات البسيطة' 
    : 'تحتاج للمراجعة (كثرة التنبيهات)';

  const hrStatus = stats.avgHeartRate >= 60 && stats.avgHeartRate <= 100 ? 'طبيعي' : 'غير مستقر';
  const spo2Status = stats.minSpo2 >= 95 ? 'طبيعي وممتاز' : stats.minSpo2 >= 90 ? 'مقبول' : 'منخفض';
  const bpStatus = stats.avgSystolic < 140 && stats.avgDiastolic < 90 ? 'طبيعي' : 'مرتفع قليلاً';

  return `
    <!DOCTYPE html>
    <html dir="rtl" lang="ar">
    <head>
      <meta charset="UTF-8">
      <style>
        body {
          font-family: 'Segoe UI', Tahoma, Geneva, Verdana, sans-serif;
          background-color: #0d1117;
          color: #c9d1d9;
          margin: 0;
          padding: 20px;
        }
        .container {
          max-width: 600px;
          margin: 0 auto;
          background: rgba(22, 27, 34, 0.8);
          border: 1px solid rgba(240, 246, 252, 0.1);
          border-radius: 16px;
          overflow: hidden;
          box-shadow: 0 10px 30px rgba(0, 0, 0, 0.5);
          backdrop-filter: blur(12px);
        }
        .header {
          background: linear-gradient(135deg, #1f6feb 0%, #111b27 100%);
          padding: 30px 20px;
          text-align: center;
          border-bottom: 1px solid rgba(240, 246, 252, 0.1);
        }
        .header h1 {
          margin: 0;
          font-size: 24px;
          color: #ffffff;
          font-weight: 600;
          letter-spacing: 0.5px;
        }
        .header p {
          margin: 5px 0 0;
          font-size: 14px;
          color: #8b949e;
        }
        .content {
          padding: 30px 20px;
        }
        .greeting {
          font-size: 16px;
          line-height: 1.6;
          margin-bottom: 25px;
        }
        .summary-card {
          background: rgba(33, 38, 45, 0.6);
          border: 1px solid rgba(240, 246, 252, 0.15);
          border-radius: 12px;
          padding: 20px;
          margin-bottom: 25px;
          text-align: center;
        }
        .summary-card h3 {
          margin: 0 0 10px;
          font-size: 18px;
          color: #58a6ff;
        }
        .summary-card .status {
          font-size: 22px;
          font-weight: 700;
          color: ${stats.alertCount === 0 ? '#3fb950' : stats.alertCount <= 2 ? '#d29922' : '#f85149'};
        }
        .metrics-grid {
          display: table;
          width: 100%;
          border-collapse: separate;
          border-spacing: 10px;
          margin-bottom: 25px;
        }
        .metric-card {
          display: table-cell;
          width: 50%;
          background: rgba(33, 38, 45, 0.4);
          border: 1px solid rgba(240, 246, 252, 0.08);
          border-radius: 12px;
          padding: 15px;
          text-align: center;
          vertical-align: top;
        }
        .metric-title {
          font-size: 12px;
          color: #8b949e;
          text-transform: uppercase;
          margin-bottom: 8px;
        }
        .metric-value {
          font-size: 22px;
          font-weight: 700;
          color: #ffffff;
          margin-bottom: 5px;
        }
        .metric-status {
          font-size: 11px;
          color: #58a6ff;
          background: rgba(56, 139, 253, 0.1);
          padding: 3px 8px;
          border-radius: 10px;
          display: inline-block;
        }
        .metric-status.good {
          color: #3fb950;
          background: rgba(46, 160, 67, 0.1);
        }
        .metric-status.warn {
          color: #d29922;
          background: rgba(187, 128, 9, 0.1);
        }
        .metric-status.danger {
          color: #f85149;
          background: rgba(248, 81, 73, 0.1);
        }
        .row-table {
          display: table;
          width: 100%;
          margin-top: 10px;
        }
        .footer {
          background-color: #161b22;
          padding: 20px;
          text-align: center;
          font-size: 12px;
          color: #8b949e;
          border-top: 1px solid rgba(240, 246, 252, 0.1);
        }
        .badge-premium {
          background: linear-gradient(90deg, #d29922, #f1e05a);
          color: #0d1117;
          font-size: 10px;
          font-weight: bold;
          padding: 2px 6px;
          border-radius: 4px;
          margin-right: 5px;
          display: inline-block;
          vertical-align: middle;
        }
      </style>
    </head>
    <body>
      <div class="container">
        <div class="header">
          <h1>التقرير الصحي الأسبوعي 📈</h1>
          <p>منظومة الرعاية الصحية الذكية WristCare</p>
        </div>
        <div class="content">
          <div class="greeting">
            مرحباً،<br>
            نرسل لكم التقرير الطبي الدوري للمريض <strong>${patientName}</strong> للفترة المنتهية في <strong>${dateStr}</strong>. يغطي هذا التقرير تحليلات المؤشرات الحيوية والتنبيهات المسجلة عبر سوار WristCare الذكي.
          </div>
          
          <div class="summary-card">
            <h3>الملخص العام للحالة</h3>
            <div class="status">${statusSummary}</div>
            <p style="margin: 10px 0 0; font-size: 13px; color: #8b949e;">
              تم تسجيل <strong>${stats.alertCount}</strong> تنبيهات حيوية غير طبيعية خلال الـ 7 أيام الماضية.
            </p>
          </div>

          <div class="row-table">
            <div class="metrics-grid">
              <div class="metric-card">
                <div class="metric-title">معدل نبضات القلب (متوسط)</div>
                <div class="metric-value">${stats.avgHeartRate} <span style="font-size: 12px; font-weight: normal; color: #8b949e;">نبضة/د</span></div>
                <div class="metric-status ${stats.avgHeartRate >= 60 && stats.avgHeartRate <= 100 ? 'good' : 'warn'}">${hrStatus}</div>
              </div>
              <div class="metric-card">
                <div class="metric-title">أدنى مستوى أكسجين SpO2</div>
                <div class="metric-value">${stats.minSpo2}%</div>
                <div class="metric-status ${stats.minSpo2 >= 95 ? 'good' : stats.minSpo2 >= 90 ? 'warn' : 'danger'}">${spo2Status}</div>
              </div>
            </div>
          </div>

          <div class="row-table">
            <div class="metrics-grid">
              <div class="metric-card" style="width: 100%; display: block; margin: 0 auto;">
                <div class="metric-title">متوسط ضغط الدم</div>
                <div class="metric-value">${stats.avgSystolic} / ${stats.avgDiastolic} <span style="font-size: 12px; font-weight: normal; color: #8b949e;">مم زئبق</span></div>
                <div class="metric-status ${stats.avgSystolic < 140 && stats.avgDiastolic < 90 ? 'good' : 'warn'}">${bpStatus}</div>
              </div>
            </div>
          </div>

          <div style="background: rgba(56,139,253,0.05); border-right: 4px solid #58a6ff; padding: 15px; border-radius: 8px; font-size: 13px; line-height: 1.6; margin-top: 20px;">
            <strong>تنويه طبي:</strong> هذا التقرير يتم إنشاؤه تلقائياً بناءً على القراءات المسجلة من السوار الذكي ولا يغني عن الاستشارة الطبية الدورية مع الطبيب المعالج. في حال وجود أعراض صحية، يرجى التوجه لأقرب مركز صحي فوراً.
          </div>
        </div>
        <div class="footer">
          <div>لقد تلقيت هذا التقرير بصفتك جهة اتصال عائلية معتمدة على باقة <span class="badge-premium">Premium</span></div>
          <div style="margin-top: 8px;">&copy; ${new Date().getFullYear()} WristCare Inc. جميع الحقوق محفوظة.</div>
        </div>
      </div>
    </body>
    </html>
  `;
}
