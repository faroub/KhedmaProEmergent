"""Approximate wilaya centroid coordinates for seeding provider locations.

Not gazetteer-precise — these are administrative center points suitable for
falling back when a provider hasn't pinned their exact service area yet.
"""

WILAYA_CENTROIDS: dict[str, tuple[float, float]] = {
    "01": (27.8742, -0.2891),   # Adrar
    "02": (36.1653, 1.3345),    # Chlef
    "03": (33.8000, 2.8650),    # Laghouat
    "04": (35.8750, 7.1130),    # Oum El Bouaghi
    "05": (35.5600, 6.1740),    # Batna
    "06": (36.7530, 5.0560),    # Béjaïa
    "07": (34.8480, 5.7280),    # Biskra
    "08": (31.6250, -2.2170),   # Béchar
    "09": (36.4700, 2.8280),    # Blida
    "10": (36.3760, 3.9020),    # Bouira
    "11": (22.7850, 5.5228),    # Tamanrasset
    "12": (35.4040, 8.1240),    # Tébessa
    "13": (34.8880, -1.3150),   # Tlemcen
    "14": (35.3710, 1.3170),    # Tiaret
    "15": (36.7180, 4.0450),    # Tizi Ouzou
    "16": (36.7538, 3.0588),    # Algiers
    "17": (34.6700, 3.2500),    # Djelfa
    "18": (36.8210, 5.7660),    # Jijel
    "19": (36.1900, 5.4130),    # Sétif
    "20": (34.8410, 0.1500),    # Saïda
    "21": (36.8700, 6.9090),    # Skikda
    "22": (35.1900, -0.6400),   # Sidi Bel Abbès
    "23": (36.9000, 7.7660),    # Annaba
    "24": (36.4620, 7.4290),    # Guelma
    "25": (36.3650, 6.6147),    # Constantine
    "26": (36.2650, 2.7550),    # Médéa
    "27": (35.9310, 0.0890),    # Mostaganem
    "28": (35.7050, 4.5410),    # M'Sila
    "29": (35.3960, 0.1400),    # Mascara
    "30": (31.9540, 5.3380),    # Ouargla
    "31": (35.6969, -0.6331),   # Oran
    "32": (33.6800, 1.0200),    # El Bayadh
    "33": (26.4830, 8.4670),    # Illizi
    "34": (36.0740, 4.7610),    # Bordj Bou Arréridj
    "35": (36.7660, 3.4770),    # Boumerdès
    "36": (36.7670, 8.3140),    # El Tarf
    "37": (27.6700, -8.1470),   # Tindouf
    "38": (35.6070, 1.8110),    # Tissemsilt
    "39": (33.3680, 6.8630),    # El Oued
    "40": (35.4260, 7.1430),    # Khenchela
    "41": (36.2860, 7.9510),    # Souk Ahras
    "42": (36.5940, 2.4470),    # Tipaza
    "43": (36.4500, 6.2640),    # Mila
    "44": (36.2620, 1.9640),    # Aïn Defla
    "45": (33.2670, -0.3210),   # Naâma
    "46": (35.2980, -1.1400),   # Aïn Témouchent
    "47": (32.4890, 3.6730),    # Ghardaïa
    "48": (35.7370, 0.5580),    # Relizane
    "49": (29.2500, 0.2400),    # Timimoun
    "50": (21.3300, 0.9500),    # Bordj Badji Mokhtar
    "51": (34.4200, 5.0600),    # Ouled Djellal
    "52": (30.1200, -2.1700),   # Béni Abbès
    "53": (27.2100, 2.4700),    # In Salah
    "54": (19.5700, 5.7700),    # In Guezzam
    "55": (33.1100, 6.0700),    # Touggourt
    "56": (24.5540, 9.4840),    # Djanet
    "57": (33.9500, 5.9200),    # El M'Ghair
    "58": (30.5770, 2.8790),    # El Meniaa
}
