
import React, { useState, useMemo, useCallback, useEffect, useRef } from "react";
import ReactDOM from "react-dom";
import { useRouter, useFocusEffect } from 'expo-router';
import { supabase } from '../lib/supabase';
import { useAuth, canEdit as authCanEdit, canDelete as authCanDelete } from '../lib/auth';

// ─── Types ────────────────────────────────────────────────────
type HazardRating = 0 | 1 | 2 | 3 | 4;
type StockStatus  = 'in_stock' | 'low_stock' | 'out_of_stock';
type UserRole     = 'admin' | 'technician' | 'viewer';

interface Chemical {
  id: string;
  name: string;
  cas_number: string;
  storage_class: string;
  location: string;
  health: HazardRating;
  fire: HazardRating;
  instability: HazardRating;
  special: string;
  quantity: number;
  unit: string;
  min_stock: number;
  expiry_date: string;
  supplier: string;
  notes: string;
  created_at: string;
  updated_at: string;
}

interface ActivityEntry {
  id: string;
  action: 'add' | 'edit' | 'delete' | 'adjust';
  chemical_id: string;
  description: string;
  user: string;
  time: string;
}

interface User {
  id: string;
  name: string;
  role: UserRole;
}

type ModalState =
  | { type: 'add' }
  | { type: 'edit'; chemical: Chemical }
  | { type: 'delete'; chemical: Chemical }
  | { type: 'adjust'; chemical: Chemical }
  | null;

// ─── Constants ────────────────────────────────────────────────
const STORAGE_CLASSES = ['3', '4.1', '4.2', '4.3', '5.1A', '5.1B', '5.1C', '6.1A', '6.1B', '6.1C', '6.1D', '8A', '8B', '10', '11', '12', '13'];
const UNITS = ['L', 'mL', 'kg', 'g', 'mg', 'units'];
const SPECIAL_CODES = ['OX', 'COR', 'ALK', 'ACID', '-W-'];

// Pre-populated from PDF inventory
const PDF_CHEMICALS: Omit<Chemical, 'id' | 'quantity' | 'unit' | 'min_stock' | 'supplier' | 'notes' | 'created_at' | 'updated_at'>[] = [
  { name: '1,10-Phenanthroline monohydrate', cas_number: '5144-89-8', storage_class: '6.1D', location: '11', health: 2, fire: 1, instability: 0, special: '', expiry_date: '' },
  { name: '1,5-Diphenylcarbazide', cas_number: '140-22-7', storage_class: '6.1D', location: '11', health: 2, fire: 0, instability: 0, special: '', expiry_date: '' },
  { name: '2,6-Di-tert-butyl-4-methylphenol', cas_number: '128-37-0', storage_class: '6.1D', location: '11', health: 2, fire: 1, instability: 0, special: '', expiry_date: '' },
  { name: '2-Ethylhexyl acrylate', cas_number: '103-11-7', storage_class: '6.1D', location: '11', health: 2, fire: 2, instability: 2, special: '', expiry_date: '' },
  { name: '2-Propanol', cas_number: '67-63-0', storage_class: '3', location: '3', health: 1, fire: 3, instability: 0, special: '', expiry_date: '' },
  { name: 'Acetic acid', cas_number: '64-19-7', storage_class: '3', location: '3', health: 3, fire: 2, instability: 0, special: '', expiry_date: '' },
  { name: 'Acetic anhydride', cas_number: '108-24-7', storage_class: '3', location: '3', health: 3, fire: 2, instability: 1, special: '', expiry_date: '' },
  { name: 'Acetone', cas_number: '67-64-1', storage_class: '3', location: '4', health: 1, fire: 3, instability: 0, special: '', expiry_date: '' },
  { name: 'Acetonitrile', cas_number: '75-05-8', storage_class: '3', location: '4', health: 2, fire: 3, instability: 0, special: '', expiry_date: '' },
  { name: 'Acrylic acid', cas_number: '79-10-7', storage_class: '3', location: '3', health: 3, fire: 2, instability: 2, special: '', expiry_date: '' },
  { name: 'Activated charcoal', cas_number: '7440-44-0', storage_class: '10-13', location: '6', health: 1, fire: 3, instability: 0, special: '', expiry_date: '' },
  { name: 'Adipic acid', cas_number: '124-04-9', storage_class: '6.1D', location: '11', health: 2, fire: 1, instability: 0, special: '', expiry_date: '' },
  { name: 'Adipic acid dihydrazide', cas_number: '1071-93-8', storage_class: '6.1D', location: '11', health: 0, fire: 1, instability: 0, special: '', expiry_date: '' },
  { name: 'Alizarin Red S', cas_number: '130-22-3', storage_class: '6.1D', location: '11', health: 2, fire: 0, instability: 0, special: '', expiry_date: '' },
  { name: 'Ammonium bicarbonate', cas_number: '1066-33-7', storage_class: '6.1D', location: '11', health: 2, fire: 0, instability: 0, special: '', expiry_date: '' },
  { name: 'Ammonium chloride', cas_number: '12125-02-9', storage_class: '6.1D', location: '11', health: 2, fire: 0, instability: 0, special: '', expiry_date: '' },
  { name: 'Ammonium heptamolybdate tetrahydrate', cas_number: '12054-85-2', storage_class: '6.1D', location: '11', health: 2, fire: 0, instability: 0, special: '', expiry_date: '' },
  { name: 'Ammonium hydroxide solution', cas_number: '1336-21-6', storage_class: '8B', location: '8', health: 3, fire: 1, instability: 0, special: 'COR', expiry_date: '' },
  { name: 'Ammonium iron(III) sulfate dodecahydrate', cas_number: '7783-83-7', storage_class: '6.1D', location: '11', health: 1, fire: 0, instability: 0, special: '', expiry_date: '' },
  { name: 'Ammonium metavanadate', cas_number: '7803-55-6', storage_class: '6.1A', location: '11', health: 4, fire: 0, instability: 0, special: '', expiry_date: '' },
  { name: 'Ammonium nitrate', cas_number: '6484-52-2', storage_class: '5.1C', location: '9', health: 1, fire: 0, instability: 3, special: 'OX', expiry_date: '' },
  { name: 'Ammonium persulfate', cas_number: '7727-54-0', storage_class: '5.1B', location: '12', health: 2, fire: 1, instability: 2, special: 'OX', expiry_date: '' },
  { name: 'Ascorbic Acid', cas_number: '50-81-7', storage_class: '6.1D', location: '11', health: 0, fire: 0, instability: 0, special: '', expiry_date: '' },
  { name: 'Barium carbonate', cas_number: '513-77-9', storage_class: '6.1D', location: '11', health: 2, fire: 0, instability: 0, special: '', expiry_date: '' },
  { name: 'Barium chloride dihydrate', cas_number: '10326-27-9', storage_class: '6.1D', location: '11', health: 3, fire: 1, instability: 0, special: '', expiry_date: '' },
  { name: 'Barium sulfate', cas_number: '7727-43-7', storage_class: '6.1D', location: '11', health: 0, fire: 0, instability: 0, special: '', expiry_date: '' },
  { name: 'Benzethonium chloride', cas_number: '121-54-0', storage_class: '6.1D', location: '11', health: 3, fire: 2, instability: 0, special: '', expiry_date: '' },
  { name: 'Boric acid', cas_number: '10043-35-3', storage_class: '6.1D', location: '11', health: 1, fire: 0, instability: 0, special: '', expiry_date: '' },
  { name: 'Bromine', cas_number: '7726-95-6', storage_class: '6.1A', location: '11', health: 3, fire: 0, instability: 0, special: 'OX', expiry_date: '' },
  { name: 'Bromocresol Green', cas_number: '76-60-8', storage_class: '6.1D', location: '11', health: 2, fire: 1, instability: 0, special: '', expiry_date: '' },
  { name: 'Bromoform', cas_number: '75-25-2', storage_class: '6.1D', location: '11', health: 3, fire: 0, instability: 0, special: '', expiry_date: '' },
  { name: 'Bromothymol Blue', cas_number: '76-59-5', storage_class: '6.1D', location: '11', health: 2, fire: 1, instability: 0, special: '', expiry_date: '' },
  { name: 'Butyl acetate', cas_number: '123-86-4', storage_class: '3', location: '3', health: 2, fire: 3, instability: 0, special: '', expiry_date: '' },
  { name: 'Butyl glycol', cas_number: '111-76-2', storage_class: '3', location: '3', health: 2, fire: 2, instability: 0, special: '', expiry_date: '' },
  { name: 'Calcium carbonate', cas_number: '471-34-1', storage_class: '6.1D', location: '11', health: 0, fire: 0, instability: 0, special: '', expiry_date: '' },
  { name: 'Calcium chloride', cas_number: '10043-52-4', storage_class: '6.1B', location: '11', health: 2, fire: 0, instability: 1, special: '', expiry_date: '' },
  { name: 'Carbon tetrachloride', cas_number: '56-23-5', storage_class: '11', location: '1', health: 3, fire: 0, instability: 0, special: '', expiry_date: '' },
  { name: 'Carboxymethylcellulose sodium salt', cas_number: '9004-32-4', storage_class: '6.1D', location: '11', health: 0, fire: 0, instability: 0, special: '', expiry_date: '' },
  { name: 'Chloroform', cas_number: '67-66-3', storage_class: '6.1D', location: '11', health: 2, fire: 0, instability: 0, special: '', expiry_date: '' },
  { name: 'Chromium(III) oxide', cas_number: '1308-38-9', storage_class: '10-13', location: '6', health: 1, fire: 0, instability: 0, special: '', expiry_date: '' },
  { name: 'Chromotropic acid disodium salt dihydrate', cas_number: '5808-22-0', storage_class: '10-13', location: '6', health: 1, fire: 0, instability: 0, special: '', expiry_date: '' },
  { name: 'Citric acid', cas_number: '77-92-9', storage_class: '6.1D', location: '11', health: 2, fire: 1, instability: 0, special: '', expiry_date: '' },
  { name: 'Cobalt(II) chloride hexahydrate', cas_number: '7791-13-1', storage_class: '6.1D', location: '11', health: 3, fire: 0, instability: 0, special: '', expiry_date: '' },
  { name: 'Copper(II) sulfate', cas_number: '7758-98-7', storage_class: '3', location: '7', health: 2, fire: 0, instability: 1, special: '', expiry_date: '' },
  { name: 'Crystal Violet', cas_number: '548-62-9', storage_class: '10-13', location: '6', health: 2, fire: 2, instability: 0, special: '', expiry_date: '' },
  { name: 'Cyclohexanone', cas_number: '108-94-1', storage_class: '3', location: '3', health: 1, fire: 2, instability: 0, special: '', expiry_date: '' },
  { name: 'DBE dibasic ester', cas_number: '', storage_class: '10', location: '6', health: 2, fire: 1, instability: 0, special: '', expiry_date: '' },
  { name: 'Dextrose', cas_number: '50-99-7', storage_class: '10-13', location: '6', health: 0, fire: 0, instability: 0, special: '', expiry_date: '' },
  { name: 'di-Ammonium oxalate monohydrate', cas_number: '6009-70-7', storage_class: '6.1D', location: '11', health: 2, fire: 1, instability: 0, special: '', expiry_date: '' },
  { name: 'Dichloromethane', cas_number: '75-09-2', storage_class: '6.1D', location: '11', health: 2, fire: 1, instability: 0, special: '', expiry_date: '' },
  { name: 'Diethanolamine', cas_number: '111-42-2', storage_class: '10-13', location: '6', health: 2, fire: 1, instability: 0, special: '', expiry_date: '' },
  { name: 'Diethyl ether', cas_number: '60-29-7', storage_class: '3', location: '3', health: 2, fire: 4, instability: 1, special: '', expiry_date: '' },
  { name: 'Dimethyl sulfoxide', cas_number: '67-68-5', storage_class: '6.1D', location: '11', health: 1, fire: 2, instability: 0, special: '', expiry_date: '' },
  { name: 'Dimethyl yellow', cas_number: '60-11-7', storage_class: '6.1D', location: '11', health: 2, fire: 1, instability: 0, special: '', expiry_date: '' },
  { name: 'Dimethylamine solution', cas_number: '124-40-3', storage_class: '3', location: '3', health: 2, fire: 4, instability: 0, special: '', expiry_date: '' },
  { name: 'D-Mannitol', cas_number: '69-65-8', storage_class: '11', location: '1', health: 0, fire: 1, instability: 0, special: '', expiry_date: '' },
  { name: 'EDTA disodium salt', cas_number: '139-33-3', storage_class: '11', location: '1', health: 2, fire: 1, instability: 0, special: '', expiry_date: '' },
  { name: 'EDTA magnesium salt', cas_number: '14402-88-1', storage_class: '11', location: '1', health: 0, fire: 1, instability: 0, special: '', expiry_date: '' },
  { name: 'Eriochrome Black T', cas_number: '1787-61-7', storage_class: '10-13', location: '6', health: 1, fire: 0, instability: 0, special: '', expiry_date: '' },
  { name: 'Ethanol', cas_number: '64-17-5', storage_class: '3', location: '7', health: 2, fire: 3, instability: 0, special: '', expiry_date: '' },
  { name: 'Ethyl acetate', cas_number: '141-78-6', storage_class: '3', location: '7', health: 1, fire: 3, instability: 0, special: '', expiry_date: '' },
  { name: 'Ethylene glycol', cas_number: '107-21-1', storage_class: '10-13', location: '6', health: 2, fire: 1, instability: 0, special: '', expiry_date: '' },
  { name: 'Etidronic acid', cas_number: '2809-21-4', storage_class: '8A', location: '5', health: 2, fire: 0, instability: 0, special: '', expiry_date: '' },
  { name: 'Formaldehyde solution', cas_number: '50-00-0', storage_class: '3', location: '3', health: 3, fire: 4, instability: 0, special: 'COR', expiry_date: '' },
  { name: 'Glycerol', cas_number: '56-81-5', storage_class: '10-13', location: '6', health: 1, fire: 1, instability: 0, special: '', expiry_date: '' },
  { name: 'Hexane', cas_number: '110-54-3', storage_class: '3', location: '4', health: 1, fire: 3, instability: 0, special: '', expiry_date: '' },
  { name: 'Hydrazine hydrate', cas_number: '10217-52-4', storage_class: '6.1A', location: '11', health: 4, fire: 4, instability: 3, special: '', expiry_date: '' },
  { name: 'Hydrochloric acid', cas_number: '7647-01-0', storage_class: '8B', location: '8', health: 3, fire: 0, instability: 1, special: 'ACID', expiry_date: '' },
  { name: 'Hydrofluoric acid', cas_number: '7664-39-3', storage_class: '6.1B', location: '11', health: 4, fire: 0, instability: 0, special: 'ACID', expiry_date: '' },
  { name: 'Hydrogen peroxide 30% (w/w)', cas_number: '7722-82-1', storage_class: '5.1B', location: '12', health: 3, fire: 0, instability: 3, special: 'OX', expiry_date: '' },
  { name: 'Hydroxy naphthol blue disodium salt', cas_number: '165660-27-5', storage_class: '10-13', location: '6', health: 1, fire: 0, instability: 0, special: '', expiry_date: '' },
  { name: 'Iodine', cas_number: '7553-56-2', storage_class: '6.1D', location: '11', health: 3, fire: 0, instability: 0, special: '', expiry_date: '' },
  { name: 'Iron(II) chloride', cas_number: '7758-94-3', storage_class: '8B', location: '5', health: 3, fire: 0, instability: 0, special: '', expiry_date: '' },
  { name: 'Iron(II) sulfate heptahydrate', cas_number: '7782-63-0', storage_class: '6.1D', location: '11', health: 1, fire: 0, instability: 0, special: '', expiry_date: '' },
  { name: 'Iron(III) chloride', cas_number: '7705-08-0', storage_class: '8B', location: '5', health: 2, fire: 0, instability: 0, special: '', expiry_date: '' },
  { name: 'Iron(III) oxide', cas_number: '1309-37-1', storage_class: '6.1D', location: '11', health: 1, fire: 0, instability: 0, special: '', expiry_date: '' },
  { name: 'Isoamyl alcohol', cas_number: '123-51-3', storage_class: '3', location: '3', health: 1, fire: 2, instability: 0, special: '', expiry_date: '' },
  { name: 'Isobutanol', cas_number: '78-83-1', storage_class: '3', location: '3', health: 1, fire: 3, instability: 0, special: '', expiry_date: '' },
  { name: 'Magnesium chloride', cas_number: '7786-30-3', storage_class: '6.1D', location: '11', health: 1, fire: 0, instability: 0, special: '', expiry_date: '' },
  { name: 'Magnesium oxide', cas_number: '1309-48-4', storage_class: '6.1D', location: '11', health: 1, fire: 0, instability: 0, special: '', expiry_date: '' },
  { name: 'Magnesium Silicate', cas_number: '1343-88-0', storage_class: '6.1D', location: '11', health: 1, fire: 1, instability: 1, special: '', expiry_date: '' },
  { name: 'Magnesium sulfate heptahydrate', cas_number: '10034-99-8', storage_class: '6.1D', location: '11', health: 1, fire: 0, instability: 0, special: '', expiry_date: '' },
  { name: 'Methanesulfonic acid', cas_number: '75-75-2', storage_class: '8A', location: '8', health: 3, fire: 1, instability: 2, special: '', expiry_date: '' },
  { name: 'Methanol', cas_number: '67-56-1', storage_class: '3', location: '4', health: 1, fire: 3, instability: 0, special: '', expiry_date: '' },
  { name: 'Methyl ethyl ketone', cas_number: '78-93-3', storage_class: '3', location: '4', health: 1, fire: 3, instability: 0, special: '', expiry_date: '' },
  { name: 'Methyl isobutyl ketone', cas_number: '108-10-1', storage_class: '3', location: '3', health: 2, fire: 3, instability: 0, special: '', expiry_date: '' },
  { name: 'Methyl methacrylate', cas_number: '80-62-6', storage_class: '3', location: '3', health: 2, fire: 3, instability: 0, special: '', expiry_date: '' },
  { name: 'Methyl Orange', cas_number: '547-58-0', storage_class: '6.1D', location: '11', health: 1, fire: 0, instability: 0, special: '', expiry_date: '' },
  { name: 'Methyl Red', cas_number: '493-52-7', storage_class: '6.1D', location: '11', health: 2, fire: 1, instability: 0, special: '', expiry_date: '' },
  { name: 'Methylene blue', cas_number: '122965-43-9', storage_class: '6.1D', location: '11', health: 1, fire: 0, instability: 0, special: '', expiry_date: '' },
  { name: 'Methylparaben', cas_number: '99-76-3', storage_class: '6.1D', location: '11', health: 1, fire: 1, instability: 0, special: '', expiry_date: '' },
  { name: 'Morpholine', cas_number: '110-91-8', storage_class: '3', location: '3', health: 3, fire: 3, instability: 0, special: '', expiry_date: '' },
  { name: 'N,N-Diethylhydroxylamine', cas_number: '3710-84-7', storage_class: '3', location: '3', health: 1, fire: 2, instability: 0, special: '', expiry_date: '' },
  { name: 'N,N-Dimethylbenzylamine', cas_number: '103-83-3', storage_class: '3', location: '3', health: 3, fire: 3, instability: 0, special: '', expiry_date: '' },
  { name: 'N,N-Dimethylformamide', cas_number: '68-12-2', storage_class: '3', location: '3', health: 2, fire: 2, instability: 0, special: '', expiry_date: '' },
  { name: 'Nanoclay, hydrophilic bentonite', cas_number: '1302-78-9', storage_class: '6.1D', location: '11', health: 1, fire: 0, instability: 0, special: '', expiry_date: '' },
  { name: 'Nickel(II) chloride hexahydrate', cas_number: '7791-20-0', storage_class: '6.1D', location: '11', health: 3, fire: 0, instability: 0, special: '', expiry_date: '' },
  { name: 'Nickel(II) sulfate hexahydrate', cas_number: '10101-97-0', storage_class: '6.1D', location: '11', health: 3, fire: 0, instability: 0, special: '', expiry_date: '' },
  { name: 'Nitric Acid', cas_number: '7697-37-2', storage_class: '5.1B', location: '12', health: 4, fire: 0, instability: 2, special: 'OX', expiry_date: '' },
  { name: 'Nitrilotri(methylphosphonic acid)', cas_number: '6419-19-8', storage_class: '6.1C', location: '11', health: 2, fire: 0, instability: 0, special: '', expiry_date: '' },
  { name: 'N-Methyl-2-pyrrolidone', cas_number: '872-50-4', storage_class: '6.1C', location: '11', health: 2, fire: 2, instability: 1, special: '', expiry_date: '' },
  { name: 'Oleic Acid', cas_number: '112-80-1', storage_class: '6.1D', location: '11', health: 1, fire: 1, instability: 0, special: '', expiry_date: '' },
  { name: 'ortho-Phosphoric acid', cas_number: '7664-38-2', storage_class: '8B', location: '8', health: 3, fire: 0, instability: 0, special: '', expiry_date: '' },
  { name: 'Oxalic acid', cas_number: '144-62-7', storage_class: '11', location: '1', health: 3, fire: 1, instability: 0, special: 'ACID', expiry_date: '' },
  { name: 'p-Toluenesulfonyl isocyanate', cas_number: '4083-64-1', storage_class: '10', location: '6', health: 2, fire: 1, instability: 2, special: '', expiry_date: '' },
  { name: 'PCM 5C', cas_number: '', storage_class: '3', location: '7', health: 1, fire: 1, instability: 0, special: '', expiry_date: '' },
  { name: 'Perchloric acid', cas_number: '7601-90-3', storage_class: '5.1A', location: '12', health: 3, fire: 0, instability: 3, special: 'OX', expiry_date: '' },
  { name: 'Petroleum benzine', cas_number: '64742-49-0', storage_class: '6.1C', location: '11', health: 2, fire: 3, instability: 0, special: '', expiry_date: '' },
  { name: 'Phenolphthalein', cas_number: '77-09-8', storage_class: '12', location: '6', health: 2, fire: 3, instability: 0, special: '', expiry_date: '' },
  { name: 'Picric acid', cas_number: '88-89-1', storage_class: '10', location: '6', health: 3, fire: 4, instability: 4, special: '', expiry_date: '' },
  { name: 'Polypropylene glycol', cas_number: '25322-69-4', storage_class: '11', location: '1', health: 0, fire: 1, instability: 0, special: '', expiry_date: '' },
  { name: 'Polyvinyl Pyrrolidone', cas_number: '9003-39-8', storage_class: '13', location: '2', health: 1, fire: 0, instability: 0, special: '', expiry_date: '' },
  { name: 'Potassium chloride', cas_number: '7447-40-7', storage_class: '6.1D', location: '11', health: 1, fire: 0, instability: 0, special: '', expiry_date: '' },
  { name: 'Potassium chromate', cas_number: '7789-00-6', storage_class: '5.1B', location: '12', health: 3, fire: 0, instability: 1, special: 'OX', expiry_date: '' },
  { name: 'Potassium dichromate', cas_number: '7778-50-9', storage_class: '6.1D', location: '11', health: 4, fire: 0, instability: 1, special: 'OX', expiry_date: '' },
  { name: 'Potassium dihydrogen phosphate', cas_number: '7778-77-0', storage_class: '10-13', location: '6', health: 1, fire: 0, instability: 0, special: '', expiry_date: '' },
  { name: 'Potassium disulfite', cas_number: '16731-55-8', storage_class: '13', location: '2', health: 1, fire: 0, instability: 0, special: '', expiry_date: '' },
  { name: 'Potassium hydrogen phthalate', cas_number: '877-24-7', storage_class: '8A', location: '5', health: 0, fire: 0, instability: 0, special: '', expiry_date: '' },
  { name: 'Potassium hydroxide', cas_number: '1310-58-3', storage_class: '6.1D', location: '11', health: 3, fire: 0, instability: 0, special: 'ALK', expiry_date: '' },
  { name: 'Potassium iodide', cas_number: '7681-11-0', storage_class: '5.1B', location: '12', health: 2, fire: 0, instability: 0, special: '', expiry_date: '' },
  { name: 'Potassium permanganate', cas_number: '7722-64-7', storage_class: '11', location: '2', health: 2, fire: 0, instability: 1, special: 'OX', expiry_date: '' },
  { name: 'Potassium sodium tartrate tetrahydrate', cas_number: '6381-59-5', storage_class: '11', location: '2', health: 1, fire: 1, instability: 0, special: '', expiry_date: '' },
  { name: 'Potassium sorbate', cas_number: '24634-61-5', storage_class: '13', location: '2', health: 2, fire: 1, instability: 0, special: '', expiry_date: '' },
  { name: 'Potassium sulfate', cas_number: '7778-80-5', storage_class: '13', location: '2', health: 1, fire: 0, instability: 0, special: '', expiry_date: '' },
  { name: 'Potassium thiocyanate', cas_number: '333-20-0', storage_class: '3', location: '3', health: 2, fire: 0, instability: 0, special: '', expiry_date: '' },
  { name: 'Propionic acid', cas_number: '79-09-4', storage_class: '13', location: '2', health: 3, fire: 2, instability: 0, special: '', expiry_date: '' },
  { name: 'Propylparaben', cas_number: '94-13-3', storage_class: '3', location: '3', health: 2, fire: 1, instability: 0, special: '', expiry_date: '' },
  { name: 'Pyridine', cas_number: '110-86-1', storage_class: '6.1C', location: '11', health: 2, fire: 3, instability: 0, special: '', expiry_date: '' },
  { name: 'Quinoline', cas_number: '91-22-5', storage_class: '3', location: '3', health: 2, fire: 1, instability: 0, special: '', expiry_date: '' },
  { name: 'Silver Nitrate', cas_number: '7761-88-8', storage_class: '5.1B', location: '12', health: 3, fire: 0, instability: 2, special: 'OX', expiry_date: '' },
  { name: 'Sodium acetate', cas_number: '127-09-3', storage_class: '11', location: '1', health: 1, fire: 1, instability: 0, special: '', expiry_date: '' },
  { name: 'Sodium benzoate', cas_number: '532-32-1', storage_class: '13', location: '2', health: 2, fire: 1, instability: 0, special: '', expiry_date: '' },
  { name: 'Sodium bicarbonate', cas_number: '144-55-8', storage_class: '13', location: '2', health: 2, fire: 0, instability: 1, special: '', expiry_date: '' },
  { name: 'Sodium bisulfate monohydrate', cas_number: '10034-88-5', storage_class: '13', location: '2', health: 2, fire: 0, instability: 1, special: '', expiry_date: '' },
  { name: 'Sodium borohydride', cas_number: '16940-66-2', storage_class: '4.3', location: '10', health: 3, fire: 2, instability: 2, special: '', expiry_date: '' },
  { name: 'Sodium carbonate', cas_number: '497-19-8', storage_class: '13', location: '2', health: 1, fire: 0, instability: 0, special: '', expiry_date: '' },
  { name: 'Sodium chloride', cas_number: '7647-14-5', storage_class: '11', location: '1', health: 0, fire: 0, instability: 0, special: '', expiry_date: '' },
  { name: 'Sodium citrate tribasic dihydrate', cas_number: '6132-04-3', storage_class: '11', location: '1', health: 1, fire: 0, instability: 0, special: '', expiry_date: '' },
  { name: 'Sodium diphenylamine-4-sulfonate', cas_number: '6152-67-6', storage_class: '11', location: '1', health: 2, fire: 1, instability: 0, special: '', expiry_date: '' },
  { name: 'Sodium hydroxide', cas_number: '1310-73-2', storage_class: '8B', location: '5', health: 3, fire: 0, instability: 1, special: 'ALK', expiry_date: '' },
  { name: 'Sodium hypophosphite monohydrate', cas_number: '10039-56-2', storage_class: '11', location: '1', health: 1, fire: 0, instability: 0, special: '', expiry_date: '' },
  { name: 'Sodium lauryl sulfate', cas_number: '151-21-3', storage_class: '11', location: '1', health: 2, fire: 1, instability: 0, special: '', expiry_date: '' },
  { name: 'Sodium metaperiodate', cas_number: '7790-28-5', storage_class: '5.1A', location: '12', health: 2, fire: 0, instability: 0, special: '', expiry_date: '' },
  { name: 'Sodium metasilicate', cas_number: '6834-92-0', storage_class: '8B', location: '5', health: 2, fire: 0, instability: 0, special: '', expiry_date: '' },
  { name: 'Sodium molybdate dihydrate', cas_number: '10102-40-6', storage_class: '6.1D', location: '11', health: 2, fire: 0, instability: 0, special: '', expiry_date: '' },
  { name: 'Sodium nitrate', cas_number: '7631-99-4', storage_class: '5.1B', location: '12', health: 1, fire: 0, instability: 0, special: 'OX', expiry_date: '' },
  { name: 'Sodium oxalate', cas_number: '62-76-0', storage_class: '11', location: '1', health: 1, fire: 0, instability: 0, special: '', expiry_date: '' },
  { name: 'Sodium Polyacrylate', cas_number: '9003-04-7', storage_class: '6.1D', location: '11', health: 2, fire: 0, instability: 0, special: '', expiry_date: '' },
  { name: 'Sodium sulfate', cas_number: '7757-82-6', storage_class: '13', location: '2', health: 1, fire: 0, instability: 0, special: '', expiry_date: '' },
  { name: 'Sodium sulfide', cas_number: '1313-82-2', storage_class: '4.2', location: '10', health: 3, fire: 1, instability: 1, special: '', expiry_date: '' },
  { name: 'Sodium tetraborate decahydrate', cas_number: '1303-96-4', storage_class: '6.1D', location: '11', health: 1, fire: 0, instability: 0, special: '', expiry_date: '' },
  { name: 'Sodium thiosulfate', cas_number: '7772-98-7', storage_class: '11', location: '1', health: 1, fire: 0, instability: 0, special: '', expiry_date: '' },
  { name: 'Starch, soluble', cas_number: '232-679-6', storage_class: '13', location: '2', health: 1, fire: 0, instability: 0, special: '', expiry_date: '' },
  { name: 'Strontium carbonate', cas_number: '1633-05-2', storage_class: '6.1D', location: '11', health: 1, fire: 0, instability: 0, special: '', expiry_date: '' },
  { name: 'Sulfuric acid', cas_number: '7664-93-9', storage_class: '8A', location: '8', health: 3, fire: 0, instability: 2, special: 'OX', expiry_date: '' },
  { name: 'Sun flower oil', cas_number: '', storage_class: '10-13', location: '6', health: 0, fire: 0, instability: 0, special: '', expiry_date: '' },
  { name: 'Tetraethylammonium bromide', cas_number: '71-91-0', storage_class: '6.1D', location: '11', health: 3, fire: 1, instability: 0, special: '', expiry_date: '' },
  { name: 'Thioglycolic acid', cas_number: '68-11-1', storage_class: '6.1C', location: '11', health: 3, fire: 1, instability: 0, special: '', expiry_date: '' },
  { name: 'Tin granular', cas_number: '7440-31-5', storage_class: '8B', location: '5', health: 2, fire: 0, instability: 0, special: '', expiry_date: '' },
  { name: 'Tin(II) chloride', cas_number: '7772-99-8', storage_class: '8B', location: '5', health: 3, fire: 0, instability: 0, special: '', expiry_date: '' },
  { name: 'Titanium(III) chloride solution', cas_number: '7705-07-9', storage_class: '8B', location: '8', health: 3, fire: 0, instability: 0, special: '', expiry_date: '' },
  { name: 'Toluene', cas_number: '108-88-3', storage_class: '3', location: '4', health: 2, fire: 3, instability: 0, special: '', expiry_date: '' },
  { name: 'Xylene', cas_number: '1330-20-7', storage_class: '3', location: '3', health: 2, fire: 3, instability: 0, special: '', expiry_date: '' },
];
// ─── Helpers ──────────────────────────────────────────────────
function uid() {
  if (typeof crypto !== 'undefined' && crypto.randomUUID) return crypto.randomUUID();
  return Date.now().toString(36) + Math.random().toString(36).slice(2);
}
function nowISO() { return new Date().toISOString(); }
function fmtDate(s: string) {
  if (!s) return '—';
  try { return new Date(s).toLocaleDateString('en-GB', { day: '2-digit', month: 'short', year: 'numeric' }); }
  catch { return s; }
}
function fmtTime(s: string) {
  if (!s) return '';
  try { return new Date(s).toLocaleString('en-GB', { day: '2-digit', month: 'short', hour: '2-digit', minute: '2-digit' }); }
  catch { return s; }
}
function csvEscape(v: unknown) { return '"' + String(v ?? '').replace(/"/g, '""') + '"'; }

function daysUntilExpiry(d: string): number | null {
  if (!d) return null;
  return Math.floor((new Date(d).getTime() - Date.now()) / 86400000);
}

function stockStatus(c: Chemical): StockStatus {
  if (c.quantity === 0)           return 'out_of_stock';
  if (c.quantity <= c.min_stock)  return 'low_stock';
  return 'in_stock';
}

// ─── Style helpers ─────────────────────────────────────────────
const HAZARD_COLOR: Record<HazardRating, string> = {
  0: '#16a34a', 1: '#65a30d', 2: '#f59e0b', 3: '#f97316', 4: '#dc2626',
};

function stockStyle(s: StockStatus) {
  return ({
    in_stock:    { bg: '#f0fdf4', color: '#15803d', border: '#bbf7d0' },
    low_stock:   { bg: '#fffbeb', color: '#b45309', border: '#fde68a' },
    out_of_stock:{ bg: '#fef2f2', color: '#dc2626', border: '#fecaca' },
  })[s];
}

function stockLabel(s: StockStatus) {
  return ({ in_stock: 'In Stock', low_stock: 'Low Stock', out_of_stock: 'Out of Stock' })[s];
}

function activityColor(a: ActivityEntry['action']) {
  return ({ add: '#16a34a', edit: '#1d4ed8', delete: '#dc2626', adjust: '#7c3aed' })[a];
}
function activityIcon(a: ActivityEntry['action']) {
  return ({ add: '＋', edit: '✎', delete: '🗑', adjust: '⚖' })[a];
}

// ─── Shared style objects ──────────────────────────────────────
const S = {
  inp: {
    border: '1px solid #e2e8f0', borderRadius: 8, padding: '8px 12px',
    fontSize: 14, color: '#0f172a', background: '#fff', width: '100%',
    boxSizing: 'border-box' as const, outline: 'none', fontFamily: 'inherit',
  },
  btnPri: {
    background: '#1d4ed8', color: '#fff', border: '1px solid #1d4ed8',
    borderRadius: 8, padding: '8px 16px', fontSize: 13, fontWeight: 600,
    cursor: 'pointer', display: 'flex', alignItems: 'center', gap: 5,
  },
  btnSec: {
    background: '#fff', color: '#334155', border: '1px solid #e2e8f0',
    borderRadius: 8, padding: '8px 16px', fontSize: 13, fontWeight: 600, cursor: 'pointer',
  },
  btnDanger: {
    background: '#fef2f2', color: '#dc2626', border: '1px solid #fecaca',
    borderRadius: 8, padding: '8px 16px', fontSize: 13, fontWeight: 600, cursor: 'pointer',
  },
  card: {
    background: '#fff', borderRadius: 12, border: '1px solid #e2e8f0',
    padding: 14, boxShadow: '0 1px 3px rgba(0,0,0,0.06)',
  },
  overlay: {
    position: 'fixed' as const, inset: 0, background: 'rgba(15,23,42,0.5)',
    display: 'flex', alignItems: 'flex-end', justifyContent: 'center',
    zIndex: 1000, padding: '16px 16px 90px 16px',
  },
  modal: {
    background: '#fff', borderRadius: 16, width: '100%', maxWidth: 600,
    maxHeight: 'calc(100dvh - 100px)', display: 'flex', flexDirection: 'column' as const,
    boxShadow: '0 20px 60px rgba(0,0,0,0.25)',
  },
  modalHdr: {
    padding: '16px 20px', borderBottom: '1px solid #e2e8f0',
    display: 'flex', alignItems: 'center', justifyContent: 'space-between',
    position: 'sticky' as const, top: 0, background: '#fff', zIndex: 1, borderRadius: '16px 16px 0 0',
  },
  closeBtn: { background: 'none', border: 'none', fontSize: 18, cursor: 'pointer', color: '#64748b', padding: 4 },
  td: { padding: '9px 12px', verticalAlign: 'middle' as const },
  th: { padding: '8px 12px', textAlign: 'left' as const, fontSize: 11, color: '#64748b', fontWeight: 600, textTransform: 'uppercase' as const, letterSpacing: '0.05em', cursor: 'pointer', userSelect: 'none' as const, whiteSpace: 'nowrap' as const },
};

// ─── Label ─────────────────────────────────────────────────────
function Label({ children }: { children: React.ReactNode }) {
  return <div style={{ fontSize: 11, fontWeight: 600, color: '#64748b', textTransform: 'uppercase', letterSpacing: '0.4px', marginBottom: 5 }}>{children}</div>;
}

// ─── Toast ─────────────────────────────────────────────────────
interface ToastItem { id: string; msg: string; type: 'success' | 'error' | 'info'; }

function ToastContainer({ toasts }: { toasts: ToastItem[] }) {
  return (
    <div style={{ position: 'fixed', bottom: 90, right: 24, display: 'flex', flexDirection: 'column', gap: 8, zIndex: 9999 }}>
      {toasts.map(t => {
        const bg = t.type === 'error' ? '#dc2626' : t.type === 'info' ? '#1d4ed8' : '#16a34a';
        return (
          <div key={t.id} style={{
            background: bg, color: '#fff', padding: '10px 18px', borderRadius: 10,
            fontSize: 13, fontWeight: 600, boxShadow: '0 4px 12px rgba(0,0,0,0.18)',
            whiteSpace: 'nowrap', animation: 'slideIn 0.2s ease',
          }}>{t.msg}</div>
        );
      })}
    </div>
  );
}

// ─── NFPA meanings ────────────────────────────────────────────
const NFPA_MEANINGS: Record<string, Record<HazardRating, string>> = {
  H: {
    0: 'No hazard',
    1: 'Slight hazard — minor irritation possible',
    2: 'Moderate hazard — intense exposure could incapacitate',
    3: 'Serious hazard — can cause serious or permanent injury',
    4: 'Severe hazard — very short exposure could be fatal',
  },
  F: {
    0: 'Will not burn',
    1: 'Burns above 93 °C — combustible',
    2: 'Burns above 38 °C — needs moderate heat',
    3: 'Ignites at room temperature (flash pt < 38 °C)',
    4: 'Extremely flammable gas or liquid (flash pt < 23 °C)',
  },
  I: {
    0: 'Normally stable — not reactive with water',
    1: 'Normally stable — unstable at high temp',
    2: 'Violent chemical change possible — use water carefully',
    3: 'Capable of detonation with strong initiating source',
    4: 'Readily capable of detonation or explosive decomposition',
  },
};
const NFPA_LABEL: Record<string, string> = { H: 'Health', F: 'Flammability', I: 'Instability' };

// ─── Special code info ─────────────────────────────────────────
const SPECIAL_INFO: Record<string, { label: string; color: string; bg: string; border: string; icon: string; desc: string; handling: string }> = {
  'OX':   { label: 'Oxidizer',   color: '#92400e', bg: '#fffbeb', border: '#fde68a', icon: '🔵', desc: 'Oxidizing agent — supplies oxygen and can intensify fires.', handling: 'Keep away from flammables & organics. Store separately. Use non-sparking tools.' },
  'COR':  { label: 'Corrosive',  color: '#7c2d12', bg: '#fff7ed', border: '#fed7aa', icon: '⚠️', desc: 'Corrosive — causes severe burns to skin, eyes, and tissue on contact.', handling: 'Wear acid-resistant gloves, face shield, and apron. Neutralize spills before cleanup.' },
  'ALK':  { label: 'Alkali',     color: '#1e3a5f', bg: '#eff6ff', border: '#bfdbfe', icon: '🧪', desc: 'Strong alkali (base) — highly caustic, pH > 11. Causes chemical burns.', handling: 'Avoid contact with skin/eyes. Store away from acids. Neutralize spills with weak acid.' },
  'ACID': { label: 'Acid',       color: '#7f1d1d', bg: '#fef2f2', border: '#fecaca', icon: '⚗️', desc: 'Strong acid — highly corrosive, pH < 3. Reacts violently with bases and metals.', handling: 'Use fume hood. Wear PPE. Never add water to acid — always add acid to water.' },
  '-W-':  { label: 'Water React',color: '#1e3a5f', bg: '#f0f9ff', border: '#bae6fd', icon: '💧', desc: 'Reacts dangerously with water — may produce flammable/toxic gases or explode.', handling: 'Keep completely dry. Use dry sand or Class D extinguisher. Never use water to fight fire.' },
};

// ─── Special Badge (interactive, portal tooltip) ───────────────
function SpecialBadge({ code }: { code: string }) {
  const [pos, setPos] = useState<{ x: number; y: number; below: boolean } | null>(null);
  const ref = useRef<HTMLSpanElement>(null);
  const info = SPECIAL_INFO[code];
  if (!info) return <span style={{ background: '#fffbeb', color: '#92400e', fontSize: 10, fontWeight: 700, padding: '2px 5px', borderRadius: 4, border: '1px solid #fde68a', whiteSpace: 'nowrap', marginLeft: 2 }}>{code}</span>;

  const open = pos !== null;

  const handleClick = (e: React.MouseEvent) => {
    e.stopPropagation();
    if (open) { setPos(null); return; }
    const rect = ref.current!.getBoundingClientRect();
    const below = rect.top < 160;
    setPos({
      x: rect.left + rect.width / 2,
      y: below ? rect.bottom + 10 : rect.top - 10,
      below,
    });
  };

  const tooltip = open && pos && ReactDOM.createPortal(
    <>
      <div onClick={() => setPos(null)} style={{ position: 'fixed', inset: 0, zIndex: 9998 }} />
      <div style={{
        position: 'fixed',
        left: Math.max(10, Math.min(pos.x - 120, window.innerWidth - 250)),
        ...(pos.below ? { top: pos.y } : { top: pos.y - 130 }),
        width: 240,
        background: '#1e293b', color: '#f1f5f9', borderRadius: 10,
        padding: '11px 14px', zIndex: 9999,
        boxShadow: '0 8px 24px rgba(0,0,0,0.4)',
        pointerEvents: 'none',
      }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 7 }}>
          <span style={{ fontSize: 16 }}>{info.icon}</span>
          <div>
            <div style={{ fontSize: 12, fontWeight: 700, color: '#f1f5f9' }}>{info.label}</div>
            <div style={{ fontSize: 10, color: '#64748b' }}>NFPA 704 Special Hazard · {code}</div>
          </div>
        </div>
        <div style={{ fontSize: 12, lineHeight: 1.5, color: '#e2e8f0', marginBottom: 7 }}>{info.desc}</div>
        <div style={{ fontSize: 11, lineHeight: 1.5, color: '#94a3b8', borderTop: '1px solid #334155', paddingTop: 7 }}>
          <span style={{ fontWeight: 600, color: '#7dd3fc' }}>Handling: </span>{info.handling}
        </div>
      </div>
    </>,
    document.body
  );

  return (
    <>
      <span
        ref={ref}
        onClick={handleClick}
        style={{
          background: open ? info.bg : '#fffbeb',
          color: info.color,
          fontSize: 10, fontWeight: 700, padding: '2px 6px', borderRadius: 4,
          border: `1px solid ${open ? info.border : '#fde68a'}`,
          whiteSpace: 'nowrap', marginLeft: 2, cursor: 'pointer',
          boxShadow: open ? `0 0 0 2px ${info.border}` : 'none',
          transition: 'all 0.15s',
        }}
      >{code}</span>
      {tooltip}
    </>
  );
}

// ─── NFPA Dot (interactive, portal tooltip) ───────────────────
function NFPADot({ value, label }: { value: HazardRating; label: string }) {
  const [pos, setPos] = useState<{ x: number; y: number; below: boolean } | null>(null);
  const dotRef = useRef<HTMLDivElement>(null);

  const open = pos !== null;

  const handleClick = (e: React.MouseEvent) => {
    e.stopPropagation();
    if (open) { setPos(null); return; }
    const rect = dotRef.current!.getBoundingClientRect();
    const tooltipH = 110;
    const spaceAbove = rect.top;
    const below = spaceAbove < tooltipH + 20;
    setPos({
      x: Math.min(rect.left + rect.width / 2, window.innerWidth - 120),
      y: below ? rect.bottom + 10 : rect.top - 10,
      below,
    });
  };

  const tooltip = open && pos && ReactDOM.createPortal(
    <>
      <div onClick={() => setPos(null)}
        style={{ position: 'fixed', inset: 0, zIndex: 9998 }} />
      <div style={{
        position: 'fixed',
        left: Math.max(10, Math.min(pos.x - 110, window.innerWidth - 230)),
        ...(pos.below ? { top: pos.y } : { top: pos.y - 110 }),
        width: 220,
        background: '#1e293b', color: '#f1f5f9', borderRadius: 10,
        padding: '10px 13px', zIndex: 9999,
        boxShadow: '0 8px 24px rgba(0,0,0,0.4)',
        pointerEvents: 'none',
      }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 7, marginBottom: 6 }}>
          <div style={{
            width: 22, height: 22, borderRadius: 5, background: HAZARD_COLOR[value],
            display: 'flex', alignItems: 'center', justifyContent: 'center',
            color: '#fff', fontSize: 12, fontWeight: 700, flexShrink: 0,
          }}>{value}</div>
          <div>
            <div style={{ fontSize: 11, fontWeight: 700, color: '#94a3b8', textTransform: 'uppercase', letterSpacing: '0.05em' }}>{NFPA_LABEL[label]}</div>
            <div style={{ fontSize: 10, color: '#64748b' }}>NFPA 704 · Level {value}</div>
          </div>
        </div>
        <div style={{ fontSize: 12, lineHeight: 1.5, color: '#e2e8f0' }}>{NFPA_MEANINGS[label][value]}</div>
      </div>
    </>,
    document.body
  );

  return (
    <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 3, position: 'relative' }}>
      <div
        ref={dotRef}
        onClick={handleClick}
        style={{
          width: 28, height: 28, borderRadius: 6, background: HAZARD_COLOR[value],
          display: 'flex', alignItems: 'center', justifyContent: 'center',
          color: '#fff', fontSize: 13, fontWeight: 700, cursor: 'pointer',
          boxShadow: open ? '0 0 0 2px #fff, 0 0 0 4px ' + HAZARD_COLOR[value] : 'none',
          transition: 'box-shadow 0.15s',
        }}
      >{value}</div>
      <span style={{ fontSize: 9, fontWeight: 600, color: '#94a3b8', textTransform: 'uppercase', letterSpacing: '0.05em' }}>{label}</span>
      {tooltip}
    </div>
  );
}

// ─── Rating Picker ──────────────────────────────────────────────
function RatingPicker({ label, value, onChange }: { label: string; value: HazardRating; onChange: (v: HazardRating) => void }) {
  return (
    <div style={{ flex: 1 }}>
      <Label>{label}</Label>
      <div style={{ display: 'flex', gap: 4 }}>
        {([0, 1, 2, 3, 4] as HazardRating[]).map(n => (
          <button key={n} type="button" onClick={() => onChange(n)} style={{
            flex: 1, padding: '6px 0', borderRadius: 6, border: 'none', cursor: 'pointer', fontWeight: 700, fontSize: 13,
            background: value === n ? HAZARD_COLOR[n] : '#e2e8f0',
            color: value === n ? '#fff' : '#64748b',
          }}>{n}</button>
        ))}
      </div>
    </div>
  );
}

// ─── Chemical Form Modal ────────────────────────────────────────
function ChemicalFormModal({ chemical, onSave, onClose, addToast }: {
  chemical?: Chemical;
  onSave: (c: Chemical) => void;
  onClose: () => void;
  addToast: (msg: string, type?: ToastItem['type']) => void;
}) {
  const blank: Chemical = {
    id: '', name: '', cas_number: '', storage_class: '3', location: '',
    health: 0, fire: 0, instability: 0, special: '',
    quantity: 0, unit: 'L', min_stock: 1,
    expiry_date: '', supplier: '', notes: '',
    created_at: nowISO(), updated_at: nowISO(),
  };
  const norm = (c: Chemical): Chemical => ({
    ...c,
    cas_number: c.cas_number ?? '', storage_class: c.storage_class ?? '',
    location: c.location ?? '', special: c.special ?? '',
    expiry_date: c.expiry_date ?? '', supplier: c.supplier ?? '', notes: c.notes ?? '',
  });

  const [form, setForm]         = useState<Chemical>(chemical ? norm(chemical) : blank);
  const [err, setErr]           = useState('');
  const [showSeed, setShowSeed] = useState(false);
  const set = <K extends keyof Chemical>(k: K, v: Chemical[K]) => setForm(f => ({ ...f, [k]: v }));
  const inp = (k: keyof Chemical) => (e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement | HTMLTextAreaElement>) =>
    set(k, e.target.value as Chemical[typeof k]);

  const seedFrom = (c: typeof PDF_CHEMICALS[0]) => {
    setForm(f => ({ ...f, name: c.name, cas_number: c.cas_number, storage_class: c.storage_class, location: c.location, health: c.health, fire: c.fire, instability: c.instability, special: c.special }));
    setShowSeed(false);
  };

  const submit = () => {
    if (!form.name.trim()) { setErr('Chemical name is required'); return; }
    setErr('');
    onSave({ ...form, updated_at: nowISO() });
  };

  return (
    <div data-overlay style={S.overlay} onClick={e => { if (e.target === e.currentTarget) onClose(); }}>
      <div style={S.modal}>
        <div style={S.modalHdr}>
          <div style={{ fontSize: 16, fontWeight: 600, color: '#0f172a' }}>{chemical ? '✏️ Edit Chemical' : '＋ Add Chemical'}</div>
          <button style={S.closeBtn} onClick={onClose}>✕</button>
        </div>

        <div style={{ padding: '16px 20px', overflowY: 'auto', flex: 1, display: 'flex', flexDirection: 'column', gap: 12 }}>
          {/* Quick-fill from PDF */}
          {!chemical && (
            <div>
              <button type="button" onClick={() => setShowSeed(s => !s)} style={{
                ...S.btnSec, width: '100%', justifyContent: 'space-between', display: 'flex', alignItems: 'center', fontSize: 13,
                background: showSeed ? '#eff6ff' : '#f8fafc', borderColor: showSeed ? '#bfdbfe' : '#e2e8f0',
              }}>
                <span>🧪 Quick-fill from chemical inventory list ({PDF_CHEMICALS.length} chemicals)</span>
                <span style={{ fontSize: 10 }}>{showSeed ? '▲' : '▼'}</span>
              </button>
              {showSeed && (
                <div style={{ border: '1px solid #e2e8f0', borderRadius: 8, maxHeight: 220, overflowY: 'auto', marginTop: 6 }}>
                  {PDF_CHEMICALS.map((c, i) => (
                    <div key={i} onClick={() => seedFrom(c)} style={{
                      padding: '8px 12px', cursor: 'pointer', borderBottom: '1px solid #f1f5f9',
                      display: 'flex', justifyContent: 'space-between', alignItems: 'center',
                    }}
                      onMouseEnter={e => (e.currentTarget.style.background = '#f0f9ff')}
                      onMouseLeave={e => (e.currentTarget.style.background = 'transparent')}
                    >
                      <div>
                        <div style={{ fontSize: 13, fontWeight: 500, color: '#0f172a' }}>{c.name}</div>
                        <div style={{ fontSize: 11, color: '#94a3b8' }}>CAS {c.cas_number} · Class {c.storage_class} · Cabinet {c.location}</div>
                      </div>
                      <div style={{ display: 'flex', gap: 4 }}>
                        {(['H', 'F', 'I'] as const).map((l, idx) => {
                          const val = [c.health, c.fire, c.instability][idx] as HazardRating;
                          return <div key={l} style={{ width: 22, height: 22, borderRadius: 4, background: HAZARD_COLOR[val], display: 'flex', alignItems: 'center', justifyContent: 'center', color: '#fff', fontSize: 11, fontWeight: 700 }}>{val}</div>;
                        })}
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>
          )}

          {/* Identity */}
          <div>
            <Label>Chemical Name *</Label>
            <input style={S.inp} value={form.name} onChange={inp('name')} placeholder="e.g. Sulfuric acid" />
          </div>
          <div style={{ display: 'flex', gap: 10 }}>
            <div style={{ flex: 1 }}>
              <Label>CAS Number</Label>
              <input style={S.inp} value={form.cas_number} onChange={inp('cas_number')} placeholder="e.g. 7664-93-9" />
            </div>
            <div style={{ flex: 1 }}>
              <Label>Storage Class</Label>
              <select style={S.inp} value={form.storage_class} onChange={inp('storage_class')}>
                {STORAGE_CLASSES.map(s => <option key={s}>{s}</option>)}
              </select>
            </div>
          </div>
          <div style={{ display: 'flex', gap: 10 }}>
            <div style={{ flex: 1 }}>
              <Label>Cabinet / Location</Label>
              <input style={S.inp} value={form.location} onChange={inp('location')} placeholder="e.g. 5" />
            </div>
            <div style={{ flex: 1 }}>
              <Label>Special Code</Label>
              <select style={S.inp} value={form.special} onChange={inp('special')}>
                <option value="">None</option>
                {SPECIAL_CODES.map(s => <option key={s}>{s}</option>)}
              </select>
            </div>
          </div>

          {/* NFPA ratings */}
          <div>
            <Label>NFPA 704 Hazard Ratings</Label>
            <div style={{ display: 'flex', gap: 10 }}>
              <RatingPicker label="Health" value={form.health} onChange={v => set('health', v)} />
              <RatingPicker label="Fire"   value={form.fire}   onChange={v => set('fire', v)} />
              <RatingPicker label="Instability" value={form.instability} onChange={v => set('instability', v)} />
            </div>
          </div>

          {/* Stock */}
          <div style={{ display: 'flex', gap: 10 }}>
            <div style={{ flex: 2 }}>
              <Label>Current Quantity</Label>
              <input style={S.inp} type="number" min="0" step="0.01" value={form.quantity} onChange={e => set('quantity', parseFloat(e.target.value) || 0)} />
            </div>
            <div style={{ flex: 1 }}>
              <Label>Unit</Label>
              <select style={S.inp} value={form.unit} onChange={inp('unit')}>
                {UNITS.map(u => <option key={u}>{u}</option>)}
              </select>
            </div>
            <div style={{ flex: 2 }}>
              <Label>Min Stock Level</Label>
              <input style={S.inp} type="number" min="0" step="0.01" value={form.min_stock} onChange={e => set('min_stock', parseFloat(e.target.value) || 0)} />
            </div>
          </div>
          <div style={{ display: 'flex', gap: 10 }}>
            <div style={{ flex: 1 }}>
              <Label>Expiry Date</Label>
              <input style={S.inp} type="date" value={form.expiry_date} onChange={inp('expiry_date')} />
            </div>
            <div style={{ flex: 1 }}>
              <Label>Supplier</Label>
              <input style={S.inp} value={form.supplier} onChange={inp('supplier')} placeholder="Supplier name" />
            </div>
          </div>
          <div>
            <Label>Notes</Label>
            <textarea style={{ ...S.inp, minHeight: 64, resize: 'vertical' }} value={form.notes} onChange={inp('notes')} placeholder="Optional notes" />
          </div>

          {err && <div style={{ background: '#fef2f2', color: '#dc2626', padding: '8px 12px', borderRadius: 8, fontSize: 13, border: '1px solid #fecaca' }}>{err}</div>}
        </div>

        <div style={{ padding: '12px 20px', borderTop: '1px solid #e2e8f0', display: 'flex', justifyContent: 'flex-end', gap: 10, flexShrink: 0 }}>
          <button style={S.btnSec} onClick={onClose}>Cancel</button>
          <button style={S.btnPri} onClick={submit}>{chemical ? '💾 Update' : '＋ Add Chemical'}</button>
        </div>
      </div>
    </div>
  );
}

// ─── Adjust Stock Modal ─────────────────────────────────────────
function AdjustStockModal({ chemical, onSave, onClose }: {
  chemical: Chemical;
  onSave: (newQty: number, note: string) => void;
  onClose: () => void;
}) {
  // mode: 'use' = subtract used amount, 'set' = set absolute new quantity, 'add' = add restocked amount
  const [mode, setMode]   = useState<'use' | 'set' | 'add'>('use');
  const [qty, setQty]     = useState('');
  const [note, setNote]   = useState('');

  const inputVal = parseFloat(qty) || 0;

  const newQty = mode === 'use'
    ? Math.max(0, chemical.quantity - inputVal)
    : mode === 'add'
    ? chemical.quantity + inputVal
    : inputVal;

  const delta = newQty - chemical.quantity;
  const deltaValid = qty !== '' && !isNaN(inputVal) && delta !== 0;

  const tabStyle = (active: boolean, color: string) => ({
    flex: 1, padding: '8px 4px', fontSize: 12, fontWeight: 600, cursor: 'pointer',
    borderRadius: 8, border: `1.5px solid ${active ? color : '#e2e8f0'}`,
    background: active ? color + '18' : '#f8fafc',
    color: active ? color : '#64748b',
    transition: 'all 0.15s',
  } as React.CSSProperties);

  return (
    <div data-overlay style={S.overlay} onClick={e => { if (e.target === e.currentTarget) onClose(); }}>
      <div style={{ ...S.modal, maxWidth: 420 }}>
        <div style={S.modalHdr}>
          <div style={{ fontSize: 15, fontWeight: 600, color: '#0f172a' }}>⚖ Adjust Stock — {chemical.name}</div>
          <button style={S.closeBtn} onClick={onClose}>✕</button>
        </div>

        <div style={{ padding: '16px 20px', display: 'flex', flexDirection: 'column', gap: 14 }}>

          {/* Current stock banner */}
          <div style={{ background: '#f8fafc', border: '1px solid #e2e8f0', borderRadius: 10, padding: '10px 14px', display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
            <span style={{ fontSize: 12, fontWeight: 600, color: '#64748b', textTransform: 'uppercase', letterSpacing: '0.04em' }}>Current Stock</span>
            <span style={{ fontSize: 22, fontWeight: 700, color: '#0f172a' }}>{chemical.quantity} <span style={{ fontSize: 13, color: '#64748b' }}>{chemical.unit}</span></span>
          </div>

          {/* Mode tabs */}
          <div>
            <Label>Adjustment Type</Label>
            <div style={{ display: 'flex', gap: 6 }}>
              <button type="button" style={tabStyle(mode === 'use', '#dc2626')} onClick={() => { setMode('use'); setQty(''); }}>
                🔬 Used / Consumed
              </button>
              <button type="button" style={tabStyle(mode === 'add', '#15803d')} onClick={() => { setMode('add'); setQty(''); }}>
                📦 Restock / Add
              </button>
              <button type="button" style={tabStyle(mode === 'set', '#7c3aed')} onClick={() => { setMode('set'); setQty(String(chemical.quantity)); }}>
                ✏️ Set Exact
              </button>
            </div>
          </div>

          {/* Input */}
          <div>
            <Label>
              {mode === 'use' ? `Quantity Used (${chemical.unit})` : mode === 'add' ? `Quantity to Add (${chemical.unit})` : `New Total Quantity (${chemical.unit})`}
            </Label>
            <input
              style={{ ...S.inp, fontSize: 18, fontWeight: 600, padding: '10px 14px' }}
              type="number" min="0" step="0.01"
              value={qty}
              onChange={e => setQty(e.target.value)}
              placeholder={mode === 'set' ? String(chemical.quantity) : '0'}
              autoFocus
            />
          </div>

          {/* Delta preview */}
          {deltaValid && (
            <div style={{
              padding: '10px 14px', borderRadius: 9,
              background: delta > 0 ? '#f0fdf4' : '#fef2f2',
              border: `1px solid ${delta > 0 ? '#bbf7d0' : '#fecaca'}`,
              color: delta > 0 ? '#15803d' : '#dc2626',
              fontSize: 13, fontWeight: 600,
              display: 'flex', alignItems: 'center', justifyContent: 'space-between',
            }}>
              <span>{delta > 0 ? '▲ Adding' : '▼ Removing'} {Math.abs(delta).toFixed(2)} {chemical.unit}</span>
              <span style={{ opacity: 0.75 }}>→ {newQty.toFixed(2)} {chemical.unit}</span>
            </div>
          )}
          {mode === 'use' && inputVal > chemical.quantity && qty !== '' && (
            <div style={{ padding: '8px 12px', borderRadius: 8, background: '#fffbeb', border: '1px solid #fde68a', color: '#b45309', fontSize: 12, fontWeight: 600 }}>
              ⚠️ Amount exceeds current stock — stock will be set to 0
            </div>
          )}

          {/* Reason */}
          <div>
            <Label>Reason (optional)</Label>
            <input style={S.inp} value={note} onChange={e => setNote(e.target.value)}
              placeholder={mode === 'use' ? 'e.g. Used in experiment, titration…' : mode === 'add' ? 'e.g. Restocked from supplier…' : 'e.g. Manual inventory count…'} />
          </div>
        </div>

        <div style={{ padding: '12px 20px', borderTop: '1px solid #e2e8f0', display: 'flex', justifyContent: 'flex-end', gap: 10, flexShrink: 0 }}>
          <button style={S.btnSec} onClick={onClose}>Cancel</button>
          <button
            style={{ ...S.btnPri, background: mode === 'use' ? '#dc2626' : mode === 'add' ? '#15803d' : '#1d4ed8', borderColor: mode === 'use' ? '#dc2626' : mode === 'add' ? '#15803d' : '#1d4ed8', opacity: qty === '' ? 0.6 : 1 }}
            disabled={qty === ''}
            onClick={() => { onSave(parseFloat(newQty.toFixed(4)), note); onClose(); }}
          >
            💾 Save
          </button>
        </div>
      </div>
    </div>
  );
}

// ─── Confirm Delete Modal ───────────────────────────────────────
function ConfirmDelete({ chemical, onConfirm, onClose }: { chemical: Chemical; onConfirm: () => void; onClose: () => void }) {
  return (
    <div data-overlay style={S.overlay} onClick={e => { if (e.target === e.currentTarget) onClose(); }}>
      <div style={{ ...S.modal, maxWidth: 400 }}>
        <div style={S.modalHdr}>
          <div style={{ fontSize: 16, fontWeight: 600, color: '#dc2626' }}>🗑 Delete Chemical</div>
          <button style={S.closeBtn} onClick={onClose}>✕</button>
        </div>
        <div style={{ padding: '16px 20px', fontSize: 14, color: '#334155' }}>
          Delete <b>{chemical.name}</b>{chemical.cas_number ? ` (CAS ${chemical.cas_number})` : ''}? This cannot be undone.
        </div>
        <div style={{ padding: '12px 20px', borderTop: '1px solid #e2e8f0', display: 'flex', justifyContent: 'flex-end', gap: 10, flexShrink: 0 }}>
          <button style={S.btnSec} onClick={onClose}>Cancel</button>
          <button style={{ ...S.btnPri, background: '#dc2626', borderColor: '#dc2626' }} onClick={onConfirm}>Delete</button>
        </div>
      </div>
    </div>
  );
}

// ─── Dashboard View ─────────────────────────────────────────────
function DashboardView({ chemicals, activity, onGoRegistry, onFilterStatus }: {
  chemicals: Chemical[];
  activity: ActivityEntry[];
  onGoRegistry: () => void;
  onFilterStatus: (f: string) => void;
}) {
  const total    = chemicals.length;
  const inStock  = chemicals.filter(c => stockStatus(c) === 'in_stock').length;
  const low      = chemicals.filter(c => stockStatus(c) === 'low_stock').length;
  const out      = chemicals.filter(c => stockStatus(c) === 'out_of_stock').length;
  const expiring = chemicals.filter(c => { const d = daysUntilExpiry(c.expiry_date); return d !== null && d <= 30; }).length;
  const highRisk = chemicals.filter(c => c.health >= 3 || c.fire >= 3 || c.instability >= 3).length;

  const byClass = Object.entries(
    chemicals.reduce<Record<string, number>>((acc, c) => { acc[c.storage_class || 'Unknown'] = (acc[c.storage_class || 'Unknown'] || 0) + 1; return acc; }, {})
  ).sort((a, b) => b[1] - a[1]).slice(0, 8);
  const maxClass = Math.max(...byClass.map(x => x[1]), 1);

  const statCards = [
    { label: 'Total',    value: total,    color: '#1d4ed8', bg: '#eff6ff', filter: '' },
    { label: 'In Stock', value: inStock,  color: '#15803d', bg: '#f0fdf4', filter: 'in_stock' },
    { label: 'Low',      value: low,      color: '#b45309', bg: '#fffbeb', filter: 'low_stock' },
    { label: 'Out',      value: out,      color: '#dc2626', bg: '#fef2f2', filter: 'out_of_stock' },
    { label: 'Expiring', value: expiring, color: '#7c3aed', bg: '#f5f3ff', filter: 'expiring' },
    { label: 'High Risk',value: highRisk, color: '#c2410c', bg: '#fff7ed', filter: 'hazardous' },
  ];

  return (
    <div style={{ padding: 16, display: 'flex', flexDirection: 'column', gap: 16 }}>
      {/* Stat cards */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(110px, 1fr))', gap: 10 }}>
        {statCards.map(s => (
          <div key={s.label} onClick={() => s.filter ? onFilterStatus(s.filter) : onGoRegistry()} style={{
            background: s.bg, borderRadius: 12, padding: '14px 16px', cursor: 'pointer',
            border: `1px solid ${s.color}22`, textAlign: 'center',
            boxShadow: '0 1px 3px rgba(0,0,0,0.06)',
          }}>
            <div style={{ fontSize: 28, fontWeight: 700, color: s.color }}>{s.value}</div>
            <div style={{ fontSize: 12, color: '#64748b', fontWeight: 500 }}>{s.label}</div>
          </div>
        ))}
      </div>

      {/* Charts row */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(220px, 1fr))', gap: 14 }}>
        {/* By storage class */}
        <div style={S.card}>
          <div style={{ fontSize: 13, fontWeight: 700, color: '#0f172a', marginBottom: 12 }}>By Storage Class</div>
          {byClass.map(([label, count]) => (
            <div key={label} style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 6 }}>
              <span style={{ fontSize: 11, fontWeight: 600, color: '#94a3b8', width: 38 }}>{label}</span>
              <div style={{ flex: 1, height: 8, background: '#e2e8f0', borderRadius: 4, overflow: 'hidden' }}>
                <div style={{ height: '100%', width: `${Math.round((count / maxClass) * 100)}%`, background: '#3b82f6', borderRadius: 4 }} />
              </div>
              <span style={{ fontSize: 11, color: '#94a3b8', width: 18, textAlign: 'right' }}>{count}</span>
            </div>
          ))}
        </div>

        {/* Stock status breakdown */}
        <div style={S.card}>
          <div style={{ fontSize: 13, fontWeight: 700, color: '#0f172a', marginBottom: 12 }}>Stock Overview</div>
          {([['in_stock', inStock], ['low_stock', low], ['out_of_stock', out]] as const).map(([s, count]) => {
            const st = stockStyle(s as StockStatus);
            const pct = total ? Math.round((count / total) * 100) : 0;
            return (
              <div key={s} style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 8 }}>
                <span style={{ fontSize: 11, fontWeight: 600, color: st.color, width: 72 }}>{stockLabel(s as StockStatus)}</span>
                <div style={{ flex: 1, height: 8, background: '#e2e8f0', borderRadius: 4, overflow: 'hidden' }}>
                  <div style={{ height: '100%', width: `${pct}%`, background: st.color, borderRadius: 4 }} />
                </div>
                <span style={{ fontSize: 11, color: '#94a3b8', width: 28, textAlign: 'right' }}>{count}</span>
              </div>
            );
          })}

          <div style={{ marginTop: 16, paddingTop: 12, borderTop: '1px solid #f1f5f9' }}>
            <div style={{ fontSize: 11, fontWeight: 600, color: '#94a3b8', marginBottom: 8, textTransform: 'uppercase', letterSpacing: '0.05em' }}>Alerts</div>
            {expiring > 0 && (
              <div style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: 12, color: '#7c3aed', marginBottom: 4 }}>
                ⏰ <span>{expiring} chemical{expiring !== 1 ? 's' : ''} expiring within 30 days</span>
              </div>
            )}
            {highRisk > 0 && (
              <div style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: 12, color: '#c2410c' }}>
                ⚠️ <span>{highRisk} high-risk chemical{highRisk !== 1 ? 's' : ''} (NFPA ≥ 3)</span>
              </div>
            )}
            {expiring === 0 && highRisk === 0 && (
              <div style={{ fontSize: 12, color: '#15803d' }}>✅ No critical alerts</div>
            )}
          </div>
        </div>
      </div>

      {/* Activity feed */}
      <div style={S.card}>
        <div style={{ fontSize: 13, fontWeight: 700, color: '#0f172a', marginBottom: 12 }}>🕐 Recent Activity</div>
        {activity.length === 0
          ? <div style={{ textAlign: 'center', padding: 32, color: '#94a3b8', fontSize: 13 }}>No activity yet — start adding chemicals.</div>
          : activity.slice(0, 12).map(a => (
            <div key={a.id} style={{ display: 'flex', alignItems: 'flex-start', gap: 10, padding: '10px 0', borderBottom: '1px solid #f1f5f9' }}>
              <div style={{
                width: 30, height: 30, borderRadius: '50%', flexShrink: 0, marginTop: 1,
                background: activityColor(a.action) + '18', color: activityColor(a.action),
                display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 13,
              }}>{activityIcon(a.action)}</div>
              <div style={{ flex: 1, minWidth: 0, fontSize: 13, color: '#334155' }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginBottom: 2 }}>
                  <span style={{
                    fontSize: 10, fontWeight: 700, textTransform: 'uppercase',
                    color: activityColor(a.action), background: activityColor(a.action) + '18',
                    padding: '1px 6px', borderRadius: 5,
                  }}>{a.action}</span>
                </div>
                <div style={{ fontSize: 12, color: '#475569', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{a.description}</div>
                <div style={{ fontSize: 11, color: '#94a3b8', marginTop: 2 }}>{(a as any).logged_by ?? a.user} · {fmtTime(a.time)}</div>
              </div>
            </div>
          ))
        }
      </div>

      {/* Spacer so content clears native bottom nav on mobile */}
      <div className="bottom-spacer" />
    </div>
  );
}

// ─── Registry View ──────────────────────────────────────────────
function RegistryView({ chemicals, onAdd, onEdit, onDelete, onAdjust, onNavigate, user, initFilter }: {
  chemicals: Chemical[];
  onAdd: () => void;
  onEdit: (c: Chemical) => void;
  onDelete: (c: Chemical) => void;
  onAdjust: (c: Chemical) => void;
  onNavigate: (id: string) => void;
  user: User;
  initFilter: string;
}) {
  const [q, setQ]               = useState('');
  const [fStatus, setFStatus]   = useState(initFilter !== 'expiring' && initFilter !== 'hazardous' ? initFilter : '');
  const [fSpecial, setFSpecial] = useState('');
  const [sortK, setSortK]       = useState<keyof Chemical>('name');
  const [sortD, setSortD]       = useState(1);
  const [fExpiring, setFExpiring]   = useState(initFilter === 'expiring');
  const [fHazardous, setFHazardous] = useState(initFilter === 'hazardous');
  const [page, setPage]         = useState(1);
  const PER_PAGE = 150;

  const doSort = (k: keyof Chemical) => {
    if (sortK === k) setSortD(d => d === 1 ? -1 : 1);
    else { setSortK(k); setSortD(1); }
    setPage(1);
  };

  const filtered = useMemo(() => {
    setPage(1);
    let r = chemicals.filter(c => {
      const s = stockStatus(c);
      if (fStatus && s !== fStatus) return false;
      if (fSpecial && !c.special.split(',').map(s => s.trim()).includes(fSpecial)) return false;
      if (fExpiring && (daysUntilExpiry(c.expiry_date) ?? 9999) > 30) return false;
      if (fHazardous && c.health < 3 && c.fire < 3 && c.instability < 3) return false;
      if (q) {
        const lq = q.toLowerCase();
        if (![c.name, c.cas_number, c.storage_class, c.location, c.supplier, c.notes].join(' ').toLowerCase().includes(lq)) return false;
      }
      return true;
    });
    r.sort((a, b) => {
      const va = String(a[sortK] ?? '');
      const vb = String(b[sortK] ?? '');
      return isNaN(Number(va)) ? va.localeCompare(vb) * sortD : (Number(va) - Number(vb)) * sortD;
    });
    return r;
  }, [chemicals, q, fStatus, fSpecial, fExpiring, fHazardous, sortK, sortD]);

  const pages   = Math.max(1, Math.ceil(filtered.length / PER_PAGE));
  const visible = filtered.slice((page - 1) * PER_PAGE, page * PER_PAGE);

  const exportCSV = () => {
    const header = ['Name', 'CAS No.', 'Class', 'Cabinet', 'Health', 'Fire', 'Instability', 'Special', 'Qty', 'Unit', 'Min Stock', 'Status', 'Expiry', 'Supplier', 'Notes'];
    const rows = filtered.map(c => [c.name, c.cas_number, c.storage_class, c.location, c.health, c.fire, c.instability, c.special, c.quantity, c.unit, c.min_stock, stockStatus(c), c.expiry_date, c.supplier, c.notes].map(csvEscape));
    const csv = [header.map(csvEscape), ...rows].map(r => r.join(',')).join('\n');
    const a = document.createElement('a');
    a.href = 'data:text/csv;charset=utf-8,' + encodeURIComponent(csv);
    a.download = 'Chemical_Stock.csv';
    a.click();
  };

  const SortBtn = ({ label, k }: { label: string; k: keyof Chemical }) => (
    <span onClick={() => doSort(k)} style={{ cursor: 'pointer', userSelect: 'none', display: 'inline-flex', alignItems: 'center', gap: 3 }}>
      {label}
      <span style={{ fontSize: 9, opacity: sortK === k ? 1 : 0.3 }}>{sortK === k ? (sortD === 1 ? '▲' : '▼') : '⇅'}</span>
    </span>
  );

  return (
    <div style={{ display: 'flex', flexDirection: 'column', flex: 1, minHeight: 0 }}>
      {/* Toolbar */}
      <div style={{ padding: '10px 16px', display: 'flex', gap: 8, flexWrap: 'wrap', alignItems: 'center', flexShrink: 0, borderBottom: '1px solid #f1f5f9' }}>
        <div style={{ position: 'relative', flex: 1, minWidth: 180 }}>
          <span style={{ position: 'absolute', left: 10, top: '50%', transform: 'translateY(-50%)', color: '#94a3b8', fontSize: 13, pointerEvents: 'none' }}>🔍</span>
          <input style={{ ...S.inp, paddingLeft: 32 }} value={q} onChange={e => setQ(e.target.value)} placeholder="Search chemicals…" />
        </div>
        <select style={{ ...S.inp, width: 'auto', minWidth: 120 }} value={fStatus} onChange={e => setFStatus(e.target.value)}>
          <option value="">All stock</option>
          <option value="in_stock">In Stock</option>
          <option value="low_stock">Low Stock</option>
          <option value="out_of_stock">Out of Stock</option>
        </select>
        <select style={{ ...S.inp, width: 'auto', minWidth: 100 }} value={fSpecial} onChange={e => setFSpecial(e.target.value)}>
          <option value="">All special</option>
          {SPECIAL_CODES.map(s => <option key={s}>{s}</option>)}
        </select>
        <button onClick={() => setFExpiring(x => !x)} style={{
          ...S.btnSec, background: fExpiring ? '#f5f3ff' : '#fff', borderColor: fExpiring ? '#8b5cf6' : '#e2e8f0', color: fExpiring ? '#6d28d9' : '#334155',
        }}>⏰ Expiring</button>
        <button onClick={() => setFHazardous(x => !x)} style={{
          ...S.btnSec, background: fHazardous ? '#fff7ed' : '#fff', borderColor: fHazardous ? '#f97316' : '#e2e8f0', color: fHazardous ? '#c2410c' : '#334155',
        }}>⚠️ High Risk</button>
        <div style={{ marginLeft: 'auto', display: 'flex', gap: 8, flexShrink: 0 }}>
          <button style={S.btnSec} onClick={exportCSV} title="Export as CSV">⬇ Export</button>
          {user.role === 'admin' && (
            <button style={S.btnPri} onClick={onAdd}>＋ Add Chemical</button>
          )}
        </div>
      </div>

      <div style={{ padding: '6px 16px 8px', flexShrink: 0, display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
        <span style={{ fontSize: 12, color: '#94a3b8' }}>
          {filtered.length} chemical{filtered.length !== 1 ? 's' : ''}
          {pages > 1 && <span style={{ marginLeft: 6 }}>· page {page}/{pages}</span>}
        </span>
        {pages > 1 && (
          <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
            <button onClick={() => setPage(p => Math.max(1, p - 1))} disabled={page === 1} style={{
              width: 28, height: 28, borderRadius: 7, border: '1px solid #e2e8f0', background: '#fff',
              cursor: page === 1 ? 'default' : 'pointer', fontSize: 16, display: 'flex',
              alignItems: 'center', justifyContent: 'center', color: page === 1 ? '#cbd5e1' : '#334155',
            }}>‹</button>
            {Array.from({ length: pages }, (_, i) => i + 1).map(p => (
              <button key={p} onClick={() => setPage(p)} style={{
                width: 28, height: 28, borderRadius: 7, border: `1px solid ${p === page ? '#1d4ed8' : '#e2e8f0'}`,
                background: p === page ? '#1d4ed8' : '#fff', color: p === page ? '#fff' : '#334155',
                fontSize: 12, fontWeight: 600, cursor: 'pointer', display: pages <= 7 ? 'flex' : (Math.abs(p - page) <= 1 || p === 1 || p === pages) ? 'flex' : 'none',
                alignItems: 'center', justifyContent: 'center',
              }}>{p}</button>
            ))}
            <button onClick={() => setPage(p => Math.min(pages, p + 1))} disabled={page === pages} style={{
              width: 28, height: 28, borderRadius: 7, border: '1px solid #e2e8f0', background: '#fff',
              cursor: page === pages ? 'default' : 'pointer', fontSize: 16, display: 'flex',
              alignItems: 'center', justifyContent: 'center', color: page === pages ? '#cbd5e1' : '#334155',
            }}>›</button>
          </div>
        )}
      </div>

      {/* Table */}
      <div className="registry-scroll" style={{ flex: 1, overflowY: 'auto', overflowX: 'auto', padding: '0 16px 16px' }}>
        <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 13, minWidth: 900 }}>
          <thead>
            <tr style={{ borderBottom: '2px solid #e2e8f0', background: '#f8fafc' }}>
              <th style={S.th}><SortBtn label="Chemical Name" k="name" /></th>
              <th style={S.th}><SortBtn label="CAS No." k="cas_number" /></th>
              <th style={S.th}><SortBtn label="Class" k="storage_class" /></th>
              <th style={S.th}><SortBtn label="Cabinet" k="location" /></th>
              <th style={S.th}>NFPA 704</th>
              <th style={S.th}><SortBtn label="Quantity" k="quantity" /></th>
              <th style={S.th}><SortBtn label="Status" k="quantity" /></th>
              <th style={S.th}><SortBtn label="Expiry" k="expiry_date" /></th>
              <th style={S.th}>Actions</th>
            </tr>
          </thead>
          <tbody>
            {filtered.length === 0 ? (
              <tr><td colSpan={9} style={{ textAlign: 'center', padding: 48, color: '#94a3b8', fontSize: 14 }}>No chemicals match your filters</td></tr>
            ) : visible.map(c => {
              const ss = stockStatus(c);
              const stStyle = stockStyle(ss);
              const exp = daysUntilExpiry(c.expiry_date);
              const expWarn = exp !== null && exp <= 30;

              return (
                <tr key={c.id} style={{ borderBottom: '1px solid #f1f5f9', background: '#fff' }}
                  onMouseEnter={e => (e.currentTarget.style.background = '#fafbfc')}
                  onMouseLeave={e => (e.currentTarget.style.background = '#fff')}
                >
                  <td style={{ ...S.td, maxWidth: 200 }}>
                    <div style={{ fontWeight: 600, color: '#0f172a', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }} title={c.name}>{c.name}</div>
                    {c.notes && <div style={{ fontSize: 11, color: '#94a3b8', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{c.notes}</div>}
                  </td>
                  <td style={{ ...S.td, fontFamily: 'monospace', fontSize: 12, color: '#64748b', whiteSpace: 'nowrap' }}>{c.cas_number || '—'}</td>
                  <td style={S.td}>
                    <span style={{ background: '#eff6ff', color: '#1d4ed8', fontSize: 11, fontWeight: 700, padding: '2px 8px', borderRadius: 6 }}>{c.storage_class || '—'}</span>
                  </td>
                  <td style={{ ...S.td, fontSize: 12, color: '#64748b' }}>{c.location || '—'}</td>
                  <td style={S.td}>
                    <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'flex-start', gap: 4 }}>
                      <NFPADot value={c.health} label="H" />
                      <NFPADot value={c.fire}   label="F" />
                      <NFPADot value={c.instability} label="I" />
                      {c.special && c.special.split(',').map(s => s.trim()).filter(Boolean).map(code => (
                        <SpecialBadge key={code} code={code} />
                      ))}
                    </div>
                  </td>
                  <td style={{ ...S.td, whiteSpace: 'nowrap' }}>
                    <span style={{ fontSize: 15, fontWeight: 700, color: '#0f172a' }}>{c.quantity}</span>
                    <span style={{ fontSize: 12, color: '#64748b', marginLeft: 4 }}>{c.unit}</span>
                    {c.min_stock > 0 && <div style={{ fontSize: 10, color: '#94a3b8' }}>min {c.min_stock}</div>}
                  </td>
                  <td style={S.td}>
                    <span style={{ background: stStyle.bg, color: stStyle.color, border: `1px solid ${stStyle.border}`, fontSize: 10, fontWeight: 700, textTransform: 'uppercase', padding: '2px 8px', borderRadius: 10 }}>
                      {stockLabel(ss)}
                    </span>
                  </td>
                  <td style={{ ...S.td, fontSize: 12, whiteSpace: 'nowrap' }}>
                    {c.expiry_date ? (
                      <span style={{ color: expWarn ? (exp! < 0 ? '#dc2626' : '#b45309') : '#64748b' }}>
                        {fmtDate(c.expiry_date)}
                        {expWarn && <div style={{ fontSize: 10 }}>{exp! < 0 ? `Expired ${Math.abs(exp!)}d ago` : `${exp}d left`}</div>}
                      </span>
                    ) : '—'}
                  </td>
                  <td style={{ ...S.td, whiteSpace: 'nowrap' }}>
                    <div style={{ display: 'flex', gap: 4 }}>
                      <button title="View detail / QR" onClick={() => onNavigate(c.id)} style={{ background: '#fff7ed', border: '1px solid #fed7aa', color: '#ea580c', borderRadius: 7, padding: '4px 8px', fontSize: 11, fontWeight: 600, cursor: 'pointer' }}>⬡ QR</button>
                      <button title="Adjust stock" onClick={() => onAdjust(c)} style={{ background: '#f5f3ff', border: '1px solid #ddd6fe', color: '#7c3aed', borderRadius: 7, padding: '4px 8px', fontSize: 11, fontWeight: 600, cursor: 'pointer' }}>⚖</button>
                      {user.role === 'admin' && (
                        <button title="Edit" onClick={() => onEdit(c)} style={{ background: '#eff6ff', border: '1px solid #bfdbfe', color: '#1d4ed8', borderRadius: 7, padding: '4px 8px', fontSize: 11, fontWeight: 600, cursor: 'pointer' }}>✏️</button>
                      )}
                      {user.role === 'admin' && (
                        <button title="Delete" onClick={() => onDelete(c)} style={{ background: '#fef2f2', border: '1px solid #fecaca', color: '#dc2626', borderRadius: 7, padding: '4px 8px', fontSize: 11, fontWeight: 600, cursor: 'pointer' }}>🗑</button>
                      )}
                    </div>
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </div>
  );
}

// ─── useIsDesktop hook ─────────────────────────────────────────
function useIsDesktop(breakpoint = 768): boolean {
  const [isDesktop, setIsDesktop] = useState(
    typeof window !== 'undefined' ? window.innerWidth >= breakpoint : false
  );
  useEffect(() => {
    const check = () => setIsDesktop(window.innerWidth >= breakpoint);
    window.addEventListener('resize', check);
    check();
    return () => window.removeEventListener('resize', check);
  }, [breakpoint]);
  return isDesktop;
}

// ─── Sidebar (desktop only) ────────────────────────────────────
function DesktopSidebar({ view, setView, chemCount, currentUser, onFilterStatus }: {
  view: string;
  setView: (v: string) => void;
  chemCount: number;
  currentUser: User;
  onFilterStatus: (f: string) => void;
}) {
  const accent = '#1B4F72';

  return (
    <nav style={{
      width: 220,
      flexShrink: 0,
      background: accent,
      color: '#fff',
      display: 'flex',
      flexDirection: 'column',
      height: '100%',
      boxShadow: '2px 0 8px rgba(0,0,0,0.12)',
    }}>
      {/* Brand */}
      <div style={{ padding: '16px 14px', display: 'flex', alignItems: 'center', gap: 10, borderBottom: '1px solid rgba(255,255,255,0.12)' }}>
        <div style={{ width: 34, height: 34, background: 'rgba(255,255,255,0.15)', borderRadius: 8, display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 16, flexShrink: 0 }}>🧪</div>
        <div>
          <div style={{ fontSize: 13, fontWeight: 600, lineHeight: 1.2 }}>Chemical Stock</div>
          <div style={{ fontSize: 10, opacity: 0.55, marginTop: 1 }}>Safety & Inventory</div>
        </div>
      </div>

      {/* Nav items */}
      <div style={{ flex: 1, padding: '8px 0', overflowY: 'auto' }}>
        <div style={{ padding: '6px 14px', fontSize: 10, fontWeight: 600, opacity: 0.5, letterSpacing: '0.08em', textTransform: 'uppercase', marginTop: 4 }}>Navigation</div>
        {[
          { id: 'dashboard', icon: '📊', label: 'Dashboard' },
          { id: 'registry',  icon: '📋', label: 'Registry', badge: chemCount },
        ].map(n => (
          <div
            key={n.id}
            onClick={() => setView(n.id)}
            style={{
              padding: '9px 14px', cursor: 'pointer', display: 'flex', alignItems: 'center', gap: 9,
              fontSize: 13, fontWeight: view === n.id ? 600 : 400,
              background: view === n.id ? 'rgba(255,255,255,0.15)' : 'transparent',
              borderLeft: view === n.id ? '3px solid #fff' : '3px solid transparent',
              transition: 'background 0.15s',
            }}
            onMouseEnter={e => { if (view !== n.id) e.currentTarget.style.background = 'rgba(255,255,255,0.08)'; }}
            onMouseLeave={e => { if (view !== n.id) e.currentTarget.style.background = 'transparent'; }}
          >
            <span>{n.icon}</span>
            <span style={{ flex: 1 }}>{n.label}</span>
            {n.badge !== undefined && (
              <span style={{ background: 'rgba(255,255,255,0.2)', fontSize: 10, fontWeight: 700, padding: '1px 7px', borderRadius: 10 }}>{n.badge}</span>
            )}
          </div>
        ))}

        {/* Quick filters */}
        <div style={{ padding: '6px 14px', fontSize: 10, fontWeight: 600, opacity: 0.5, letterSpacing: '0.08em', textTransform: 'uppercase', marginTop: 12 }}>Quick Filters</div>
        {[
          { label: '🟢 In Stock',     filter: 'in_stock' },
          { label: '🟡 Low Stock',    filter: 'low_stock' },
          { label: '🔴 Out of Stock', filter: 'out_of_stock' },
          { label: '⏰ Expiring',     filter: 'expiring' },
          { label: '⚠️ High Risk',    filter: 'hazardous' },
        ].map(f => (
          <div
            key={f.filter}
            onClick={() => { onFilterStatus(f.filter); setView('registry'); }}
            style={{ padding: '7px 14px', cursor: 'pointer', fontSize: 12, opacity: 0.85, transition: 'background 0.15s' }}
            onMouseEnter={e => (e.currentTarget.style.background = 'rgba(255,255,255,0.1)')}
            onMouseLeave={e => (e.currentTarget.style.background = 'transparent')}
          >
            {f.label}
          </div>
        ))}
      </div>
    </nav>
  );
}

// ─── DB helpers ─────────────────────────────────────────────────
function fromDB(r: any): Chemical {
  return {
    id:            r.id,
    name:          r.name,
    cas_number:    r.cas_number    ?? '',
    storage_class: r.storage_class ?? '',
    location:      r.location      ?? '',
    health:        r.health        ?? 0,
    fire:          r.fire          ?? 0,
    instability:   r.instability   ?? 0,
    special:       r.special       ?? '',
    quantity:      r.quantity      ?? 0,
    unit:          r.unit          ?? 'L',
    min_stock:     r.min_stock     ?? 1,
    expiry_date:   r.expiry_date   ?? '',
    supplier:      r.supplier      ?? '',
    notes:         r.notes         ?? '',
    created_at:    r.created_at    ?? '',
    updated_at:    r.updated_at    ?? '',
  };
}
function toDB(c: Chemical, includeId = false): Record<string, unknown> {
  const row: Record<string, unknown> = {
    name: c.name, cas_number: c.cas_number || null, storage_class: c.storage_class || null,
    location: c.location || null, health: c.health, fire: c.fire, instability: c.instability,
    special: c.special || null, quantity: c.quantity, unit: c.unit, min_stock: c.min_stock,
    expiry_date: c.expiry_date || null, supplier: c.supplier || null, notes: c.notes || null,
    updated_at: nowISO(),
  };
  if (includeId) { row.id = c.id; row.created_at = c.created_at; }
  return row;
}

// ─── Main Page ──────────────────────────────────────────────────
// The app shell (Header + BottomNav) is provided by _layout.tsx.
// Desktop: sidebar visible on the left. Mobile: tab bar at the top.
export default function ChemicalsApp() {
  const { user: authUser } = useAuth();
  const router = useRouter();
  const isDesktop = useIsDesktop(768);

  // authUser is already an AppUser with role resolved from the profiles table
  const CURRENT_USER: User = {
    id:   authUser?.id   ?? 'guest',
    name: authUser?.fullName ?? authUser?.email ?? 'Guest',
    role: (authUser?.role as UserRole) ?? 'viewer',
  };
  const isAdmin = CURRENT_USER.role === 'admin';
  const canEdit = authCanEdit(CURRENT_USER.role as any);
  const canDel  = authCanDelete(CURRENT_USER.role as any);

  const [chemicals, setChemicals]     = useState<Chemical[]>([]);
  const [activity, setActivity]       = useState<ActivityEntry[]>([]);
  const [loading, setLoading]         = useState(true);
  const [view, setView]               = useState('dashboard');
  const [modal, setModal]             = useState<ModalState>(null);
  const [toasts, setToasts]           = useState<ToastItem[]>([]);
  const [registryKey, setRegistryKey] = useState(0);
  const [initFilter, setInitFilter]   = useState('');

  const addToast = useCallback((msg: string, type: ToastItem['type'] = 'success') => {
    const id = uid();
    setToasts(t => [...t, { id, msg, type }]);
    setTimeout(() => setToasts(t => t.filter(x => x.id !== id)), 3500);
  }, []);

  useFocusEffect(useCallback(() => {
    async function load() {
      setLoading(true);
      try {
        const [{ data: cData, error: e1 }, { data: aData, error: e2 }] = await Promise.all([
          supabase.from('chemical_stock').select('*').order('name'),
          supabase.from('chemical_activity').select('*').order('time', { ascending: false }).limit(60),
        ]);
        if (e1) addToast('Failed to load chemicals: ' + e1.message, 'error');
        if (e2) addToast('Failed to load activity: ' + e2.message, 'error');
        setChemicals(cData ? cData.map(fromDB) : []);
        setActivity(aData ?? []);
      } catch (err) {
        addToast('Unexpected error loading data', 'error');
      } finally {
        setLoading(false);
      }
    }
    load();
  }, [addToast]));

  const log = useCallback((action: ActivityEntry['action'], chemId: string, desc: string) => {
    const localEntry: ActivityEntry = { id: uid(), action, chemical_id: chemId, description: desc, user: CURRENT_USER.name, time: nowISO() };
    supabase.from('chemical_activity').insert({
      action,
      chemical_id: chemId,
      description: desc,
      logged_by: CURRENT_USER.name,
    }).then(({ error }) => {
      if (error) console.error('Activity log error:', error.message);
    });
    setActivity(a => [localEntry, ...a].slice(0, 60));
  }, [CURRENT_USER.name]);

  const handleSave = async (form: Chemical) => {
    if (!isAdmin) { addToast('Permission denied — admin only', 'error'); return; }
    if (modal?.type === 'add') {
      const { data, error } = await supabase.from('chemical_stock').insert(toDB(form)).select().single();
      if (error || !data) { addToast('Failed to save', 'error'); return; }
      const saved = fromDB(data);
      setChemicals(prev => [...prev, saved].sort((a, b) => a.name.localeCompare(b.name)));
      log('add', saved.id, `Added ${saved.name}`);
      addToast('Chemical added');
    } else if (modal?.type === 'edit') {
      const { error } = await supabase.from('chemical_stock').update(toDB(form)).eq('id', form.id);
      if (error) { addToast('Failed to update', 'error'); return; }
      setChemicals(prev => prev.map(c => c.id === form.id ? form : c));
      log('edit', form.id, `Edited ${form.name}`);
      addToast('Chemical updated');
    }
    setModal(null);
  };

  const handleAdjust = async (c: Chemical, newQty: number, note: string) => {
    const { error } = await supabase.from('chemical_stock').update({ quantity: newQty, updated_at: nowISO() }).eq('id', c.id);
    if (error) { addToast('Failed to adjust stock', 'error'); return; }
    setChemicals(prev => prev.map(x => x.id === c.id ? { ...x, quantity: newQty } : x));
    log('adjust', c.id, `${c.name}: ${c.quantity} → ${newQty} ${c.unit}${note ? ` (${note})` : ''}`);
    addToast('Stock updated');
  };

  const handleDelete = async () => {
    if (!isAdmin || modal?.type !== 'delete') return;
    const c = modal.chemical;
    const { error } = await supabase.from('chemical_stock').delete().eq('id', c.id);
    if (error) { addToast('Failed to delete', 'error'); return; }
    setChemicals(prev => prev.filter(x => x.id !== c.id));
    log('delete', c.id, `Deleted ${c.name}`);
    addToast('Chemical deleted');
    setModal(null);
  };

  const goFilter = (f: string) => {
    setInitFilter(f);
    setRegistryKey(k => k + 1);
    setView('registry');
  };

  if (loading) {
    return (
      <div style={{ display: 'flex', height: '60vh', alignItems: 'center', justifyContent: 'center', background: '#f8fafc', fontFamily: 'system-ui, sans-serif', color: '#64748b' }}>
        Loading chemical stock…
      </div>
    );
  }

  return (
    <div style={{
      display: 'flex',
      flex: 1,
      background: '#f8fafc',
      fontFamily: 'system-ui, -apple-system, sans-serif',
      minHeight: 0,
      // On desktop: row (sidebar + content). On mobile: column (tab bar + content).
      flexDirection: isDesktop ? 'row' : 'column',
      height: '100%',
    }}>

      {/* ── DESKTOP: Persistent sidebar ── */}
      {isDesktop && (
        <DesktopSidebar
          view={view}
          setView={setView}
          chemCount={chemicals.length}
          currentUser={CURRENT_USER}
          onFilterStatus={goFilter}
        />
      )}

      {/* ── Right/main column ── */}
      <div style={{ display: 'flex', flexDirection: 'column', flex: 1, minWidth: 0, minHeight: 0 }}>

        {/* ── MOBILE: Tab switcher bar (hidden on desktop) ── */}
        {!isDesktop && (
          <div style={{
            display: 'flex', gap: 8, padding: '10px 16px',
            background: '#fff', borderBottom: '1px solid #e2e8f0',
            alignItems: 'center', flexShrink: 0,
          }}>
            <button
              onClick={() => setView('dashboard')}
              style={{
                ...S.btnSec,
                background: view === 'dashboard' ? '#eff6ff' : '#fff',
                borderColor: view === 'dashboard' ? '#bfdbfe' : '#e2e8f0',
                color: view === 'dashboard' ? '#1d4ed8' : '#334155',
              }}
            >
              📊 Dashboard
            </button>
            <button
              onClick={() => setView('registry')}
              style={{
                ...S.btnSec,
                background: view === 'registry' ? '#eff6ff' : '#fff',
                borderColor: view === 'registry' ? '#bfdbfe' : '#e2e8f0',
                color: view === 'registry' ? '#1d4ed8' : '#334155',
              }}
            >
              🧪 Registry ({chemicals.length})
            </button>
            <div style={{ marginLeft: 'auto', textAlign: 'right' }}>
              <div style={{ fontSize: 12, fontWeight: 700, color: '#0f172a' }}>Chemical Stock</div>
              <div style={{ fontSize: 10, color: '#94a3b8' }}>NFPA 704 Compliance</div>
            </div>
          </div>
        )}

        {/* ── Content area ── */}
        <div
          className={view === 'dashboard' ? 'page-scroll-dashboard' : 'page-scroll-registry'}
          style={{
            flex: 1,
            display: 'flex',
            flexDirection: 'column',
            minHeight: 0,
            overflowY: view === 'dashboard' ? 'auto' : 'hidden',
          }}
        >
          {view === 'dashboard' && (
            <DashboardView
              chemicals={chemicals}
              activity={activity}
              onGoRegistry={() => setView('registry')}
              onFilterStatus={goFilter}
            />
          )}
          {view === 'registry' && (
            <RegistryView
              key={registryKey}
              chemicals={chemicals}
              onAdd={() => isAdmin && setModal({ type: 'add' })}
              onEdit={c => isAdmin && setModal({ type: 'edit', chemical: c })}
              onDelete={c => isAdmin && setModal({ type: 'delete', chemical: c })}
              onAdjust={c => setModal({ type: 'adjust', chemical: c })}
              onNavigate={id => router.push(`/chemical/${id}`)}
              user={CURRENT_USER}
              initFilter={initFilter}
            />
          )}
        </div>
      </div>

      {/* ── Modals ── */}
      {modal?.type === 'add'    && <ChemicalFormModal onSave={handleSave} onClose={() => setModal(null)} addToast={addToast} />}
      {modal?.type === 'edit'   && <ChemicalFormModal chemical={modal.chemical} onSave={handleSave} onClose={() => setModal(null)} addToast={addToast} />}
      {modal?.type === 'delete' && <ConfirmDelete chemical={modal.chemical} onConfirm={handleDelete} onClose={() => setModal(null)} />}
      {modal?.type === 'adjust' && <AdjustStockModal chemical={modal.chemical} onSave={(qty, note) => handleAdjust(modal.chemical, qty, note)} onClose={() => setModal(null)} />}

      <ToastContainer toasts={toasts} />

      <style>{`
        @supports not (height: 100dvh) {
          div[style*="100dvh"] { min-height: 100vh !important; }
        }
        .page-scroll-dashboard {
          overflow-y: auto;
          -webkit-overflow-scrolling: touch;
          padding-bottom: 24px;
        }
        .page-scroll-registry {
          overflow-y: auto;
          -webkit-overflow-scrolling: touch;
          padding-bottom: 24px;
        }
        /* Mobile: extra padding for bottom nav */
        @media (max-width: 767px) {
          .page-scroll-dashboard { padding-bottom: 81px !important; }
          .page-scroll-registry  { padding-bottom: 81px !important; }
          .registry-scroll       { padding-bottom: 81px !important; }
          .bottom-spacer         { height: 81px; }
        }
        .registry-scroll { -webkit-overflow-scrolling: touch; }
        @keyframes slideIn {
          from { opacity: 0; transform: translateY(8px); }
          to   { opacity: 1; transform: translateY(0); }
        }
        /* On desktop: center modals vertically */
        @media (min-width: 768px) {
          div[data-overlay] { align-items: center !important; padding: 16px !important; }
        }
        tbody tr:hover { background: #fafbfc !important; }
      `}</style>
    </div>
  );
}
