export type Field = {
  id: string;
  label: string;
  type: string;
  required: boolean;
};
export type Section = { title: string; fields: Field[] };
export const defaultSections: Section[] = [
  {
    title: "Personal information",
    fields: [
      { id: "fullName", label: "Full Name", type: "text", required: true },
      { id: "dob", label: "Date of Birth", type: "date", required: true },
    ],
  },
  {
    title: "Contact information",
    fields: [
      { id: "phone", label: "Phone Number", type: "tel", required: true },
      { id: "whatsapp", label: "WhatsApp Number", type: "tel", required: true },
      { id: "email", label: "Email Address", type: "email", required: true },
      {
        id: "address",
        label: "Current Address",
        type: "textarea",
        required: true,
      },
      {
        id: "country",
        label: "Country of Residence",
        type: "text",
        required: true,
      },
    ],
  },
  {
    title: "Graduation",
    fields: [
      {
        id: "year",
        label: "Year of Graduation",
        type: "number",
        required: true,
      },
    ],
  },
  {
    title: "Profession",
    fields: [
      { id: "profession", label: "Profession", type: "text", required: true },
    ],
  },
  {
    title: "Declaration and consent",
    fields: [
      {
        id: "consent",
        label:
          "I confirm that I am an ex-student of FGGC Minjibir, consent to FEDMOGA using my information, and agree to abide by the rules and objectives of the association.",
        type: "checkbox",
        required: true,
      },
    ],
  },
];
