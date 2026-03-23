const crypto = require('crypto');
const admin = require('firebase-admin');

// Sadece bir kere Firebase başlatılması için kontrol
if (!admin.apps.length) {
    admin.initializeApp({
        credential: admin.credential.cert({
            projectId: process.env.FIREBASE_PROJECT_ID,
            clientEmail: process.env.FIREBASE_CLIENT_EMAIL,
            privateKey: process.env.FIREBASE_PRIVATE_KEY.replace(/\\n/g, '\n'),
        })
    });
}

export default async function handler(req, res) {
    // Sadece POST destekliyoruz
    if (req.method !== 'POST') {
        return res.status(405).send('Method Not Allowed');
    }

    const API_USER = process.env.SHOPIER_API_USER;
    const API_SECRET = process.env.SHOPIER_API_SECRET;

    const payload = req.body; // Vercel body'yi otomatik parse eder

    // Gerekli veriler gelmiş mi kontrol et
    if (!payload.res || !payload.hash) {
        return res.status(400).send('Missing parameter');
    }

    // HMAC doğrulaması (Shopier OSB Hash Mantığı)
    const dataString = payload.res + API_USER;
    const generatedHash = crypto.createHmac('sha256', API_SECRET).update(dataString).digest('hex');

    if (generatedHash !== payload.hash) {
        console.error("Güvenlik Uyarısı: Sahte bir Shopier bildirimi denendi.");
        return res.status(401).send('Geçersiz Güvenlik İmzası');
    }

    // Hash doğruysa, res içeriğini base64'ten çöz.
    let arrayResult;
    try {
        const jsonString = Buffer.from(payload.res, 'base64').toString('utf8');
        arrayResult = JSON.parse(jsonString);
    } catch (e) {
        console.error("Shopier verisi okunamadı:", e);
        return res.status(400).send('Bozuk Veri');
    }

    const buyerEmail = arrayResult.email;
    const orderId = arrayResult.orderid;
    const productName = arrayResult.productlist; // vb.

    console.log(`BİNGO! Onaylanmış Satış: E-Posta: ${buyerEmail}, Sipariş ID: ${orderId}`);

    // === MÜŞTERİYİ FIREBASE'DE PRO (SINIRSIZ) YAP ===
    try {
        // Firebase Cloud'da bu e-postaya sahip kişiyi bul
        const userRecord = await admin.auth().getUserByEmail(buyerEmail);

        // Kişinin Eklenti Tarafından Okunan "Resim Linki"ni Sınırsız Yapıyoruz (Gelecekte kodda "shopier.pro" kelimesi aranıyor)
        // Böylece veritabanı yormadan kişinin Chrome uzantısı anında yeşil ışık yakacak.
        await admin.auth().updateUser(userRecord.uid, {
            photoURL: 'https://shopier.pro/unlimited'
        });

        console.log(`Kullanıcı başarıyla PRO yapıldı: ${buyerEmail}`);
    } catch (error) {
        // Eğer eklentiye daha kayıt olmamış bir e-mail ile alışveriş yaptıysa vb.
        console.error(`Firebase kullanıcısı bulunamadı veya güncellenemedi: ${buyerEmail}`, error);
    }

    // Shopier OSB'ye her şey yolunda komutu gönder
    res.status(200).send('success');
}
