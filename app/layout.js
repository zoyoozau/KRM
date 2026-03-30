import './globals.css';

export const metadata = {
  title: 'รายงานคนรุ่นใหม่คืนถิ่น | Movement คนรุ่นใหม่ 3',
  description: 'แดชบอร์ดรายงาน Movement คนรุ่นใหม่คืนถิ่น สำนัก 6 สสส.',
  icons: {
    icon: '/images/logo-codi.jpg',
  },
};

export default function RootLayout({ children }) {
  return (
    <html lang="th">
      <body>{children}</body>
    </html>
  );
}
