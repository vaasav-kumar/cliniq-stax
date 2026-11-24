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
      <label style={{ gridColumn: "1 / -1", flexDirection: "row", alignItems: "center", gap: 8 }}>
        <input
          type="checkbox"
          name="isApartment"
          checked={checked}
          onChange={(e) => setChecked(e.target.checked)}
          style={{ width: "auto" }}
        />
        Lives in an apartment
      </label>
      {checked ? (
        <>
          <label>Apartment name *<input name="apartmentName" required maxLength={120} defaultValue={defaultApartmentName} /></label>
          <label>Door number *<input name="doorNumber" required maxLength={30} defaultValue={defaultDoorNumber} /></label>
        </>
      ) : null}
    </>
  );
}
