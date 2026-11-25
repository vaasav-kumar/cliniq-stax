"use client";

import { useState } from "react";

// Apartment checkbox. When it is checked, the apartment name and door number fields appear and become required.
export default function ApartmentFields({
  defaultChecked = false,
  defaultApartmentName = "",
  defaultDoorNumber = "",
}: {
  defaultChecked?: boolean;
  defaultApartmentName?: string;
  defaultDoorNumber?: string;
}) {
  const [checked, setChecked] = useState(defaultChecked);
  return (
    <>
      <div style={{ gridColumn: "1 / -1", display: "flex", alignItems: "center", gap: 8, fontSize: 14, color: "var(--ink)" }}>
        <input
          type="checkbox"
          name="isApartment"
          checked={checked}
          onChange={(e) => setChecked(e.target.checked)}
          style={{ width: 16, height: 16, margin: 0, padding: 0, flex: "none" }}
        />
        <span>Lives in an apartment</span>
      </div>
      {checked ? (
        <>
          <label>Apartment name *<input name="apartmentName" required maxLength={120} defaultValue={defaultApartmentName} /></label>
          <label>Door number *<input name="doorNumber" required maxLength={30} defaultValue={defaultDoorNumber} /></label>
        </>
      ) : null}
    </>
  );
}
