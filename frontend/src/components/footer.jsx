import "./footer.css";

const currentYear = new Date().getFullYear();

const members = [
  {
    name: "Trương Thị Kiều Diễm",
    phone: "0867625573",
    email: "truongkieuudiem@gmail.com",
  },
  {
    name: "Đặng Thị Mỹ Duyên",
    phone: "0399402867",
    email: "dangthimyduyenn123@gmail.com",
  },
  {
    name: "Võ Trương Khải Hoàn",
    phone: "0932564122",
    email: "hoankhai2407@gmail.com",
  },
  {
    name: "Phan Duy Thái",
    phone: "0336683102",
    email: "phanduythai1112@gmail.com",
  },
  {
    name: "Nguyễn Sỹ Tân",
    phone: "0356249217",
    email: "sytanzxc2005@gmail.com",
  },
];

export default function Footer({ language = "vi" }) {
  const isVi = language === "vi";

  return (
    <footer className="site-footer">
      <div className="site-footer-project">
        <p className="site-footer-title">
          {isVi
            ? "Nhóm dự án C1SE.38 - Đại học Duy Tân"
            : "C1SE.38 Project Team - Duy Tan University"}
        </p>
        <table className="site-footer-team">
          <tbody>
            {members.map((member) => (
              <tr key={member.email}>
                <td>{member.name}</td>
                <td>{member.phone}</td>
                <td>{member.email}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <div className="site-footer-brand">
        <img src="/ClassBridge.png" alt="ClassBridge" />
        <span>ClassBridge {currentYear}</span>
      </div>
    </footer>
  );
}