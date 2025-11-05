---
title: 'A Beginner''s Guide to REACT Analysis: Bridging the Gap from Neurotransmitters to Networks in fMRI'
permalink: /posts/2025/01/react-guide/
tags:
  - fMRI
  - PET
  - REACT
  - Dipasquale
  - Lawn
  - multimodal
  - imaging
  - neurotransmitters
  - connectivity
  - methods
  - guide
  - tutorial
---

Functional MRI (fMRI) has revolutionized cognitive neuroscience, allowing us to map neural activity and connectivity non-invasively. However, fMRI has a fundamental limitation: the BOLD signal is blind to the cellular and molecular mechanisms that give rise to it (see [<a href="#ref1">1</a>] for review). When we see altered connectivity in a patient or after administering a drug, we're left asking: *which neurotransmitter systems are giving rise to this?*

This is particularly problematic for:

1. **Pharmacological neuroimaging** where we want to understand *how* drugs affect brain networks
2. **Clinical translation** where we want to know which underlying neural mechanisms are disrupted
3. **Treatment prediction**: Identifying which patients will respond to which medications (i.e. combining 1 and 2)

Traditional approaches have tried to bridge this gap through simple spatial correlations between fMRI and the distributions of molecular systems from PET/AHBA data [<a href="#ref1">1</a>], but these overlook the rich temporal dynamics of the BOLD signal.

## The Solution: Receptor-Enriched Analysis of Functional Connectivity by Targets (REACT)

REACT is a multimodal method that "enriches" fMRI analysis with molecular information from PET imaging, developed by Ottavia Dipasquale and colleagues in 2019 [<a href="#ref2">2</a>]. Rather than treating fMRI and molecular data as separate entities, REACT integrates them into a unified analytical framework.

The premise is fairly simple: ***regions with high receptor density should contribute more to the functional dynamics associated with that neurotransmitter system.***

### What REACT Does

REACT generates *molecular-enriched networks:* functional connectivity patterns that are weighted by the distribution of specific receptors, transporters, or other molecular targets. These networks reveal which brain regions are functionally coupled (or uncoupled) with areas where a particular neurotransmitter system is most concentrated.

Importantly, REACT doesn't directly measure neurotransmitter activity or levels: fMRI simply can't do that. Instead, it provides a biologically informed lens through which to view functional connectivity, one that's grounded in the known molecular architecture of the brain [<a href="#ref1">1</a>].

## How REACT Works: The Two-Stage Framework

REACT uses a two-stage linear regression framework, related to the multivariate dual regression approach commonly used for ICA-derived resting-state networks [<a href="#ref3">3</a>]:

**Stage 1 (Spatial → Temporal):** Population-based molecular templates (PET maps) are used as spatial regressors against your fMRI data. This produces subject-specific time series representing the dominant BOLD fluctuations associated with each molecular system. *i.e.* how similar does the pattern of BOLD activity at each timepoint look to this PET map?

**Stage 2 (Temporal → Spatial):** These molecular time series are regressed against the BOLD signal in each voxel to generate subject-specific maps showing how strongly each voxel's activity is coupled with the dynamics within the broader molecular system. *i.e.* how much does each voxel's activity covary with the fluctuations across regions of high PET map density?

***In other words, stage 1 extracts the temporal dynamics of receptor-enriched regions, while Stage 2 maps which brain areas follow those dynamics.***

The output is a set of molecular-enriched functional connectivity maps (one for each receptor system you've examined) that can then be compared across conditions, groups, or correlated with behavioral and clinical measures.

<div style="width:100%; text-align:center;">
  <img src="/images/react-stages.png" alt="REACT two-stage framework" style="width:100%; max-width:900px; height:auto;">
  <p style="font-size:0.9em; font-style:italic; margin-top:4px;">
    Illustration of the REACT two-stage framework. For simplicity, a single PET map (e.g., dopamine transporter, DAT) is shown to demonstrate the spatial and temporal stages. In reality, multiple PET maps are typically used together.
  </p>
</div>

## Tutorial: Running Your First REACT Analysis

### Prerequisites

Before starting this tutorial, ensure you have:

- **Preprocessed fMRI voxelwise data**: Standard preprocessing (including spatial smoothingM)
- **Python 3.7+** with pip installed
- **FSL** installed and in your PATH
- **Basic command-line skills**: Ability to navigate directories and run bash/python commands

### Step 1: Install the REACT Toolbox

The easiest way to run REACT is using the Python package created by Ottavia Dipasquale and Matteo Frigo (https://github.com/ottaviadipasquale/react-fmri):

```bash
pip install react-fmri
```

This provides three main command-line tools:

- `react_normalize`: Normalize maps to 0-1 range while preserving the intensity distribution
- `react_masks`: Creates the masks needed for analysis
- `react`: Runs the two-stage analysis

### Step 2: Prepare Your Data

Organize your project directory (however you like, this is just an example):

```
my_react_project/
├── PET_templates/
├── fMRI_data/
│   ├── sub-001_preprocessed.nii.gz
│   ├── sub-002_preprocessed.nii.gz
│   └── ...
├── masks/
│   └── grey_matter_mask.nii.gz
└── subject_list.txt
```

Create a `subject_list.txt` file that lists all subjects processed fMRI files to be included in the analysis (one per line):

```
fMRI_data/sub-001_preprocessed.nii.gz
fMRI_data/sub-002_preprocessed.nii.gz
fMRI_data/sub-003_preprocessed.nii.gz
...
```

### Step 3: Get Your Molecular Templates

You'll need population-based PET map(s) of receptor or transporter density to fill the sad empty PET_templates directory in Step 2. Several excellent resources are available:

- **neuromaps** [<a href="#ref4">4</a>]: A Python toolbox providing access to a curated collection of brain maps, including many PET maps (https://github.com/netneurolab/neuromaps)
- **JuSpace** [<a href="#ref5">5</a>]: A toolbox specifically designed for PET-informed analyses which also has PET maps (https://www.fz-juelich.de/en/inm/inm-7/research/methods-and-tools/juspace)
- **Original publications**: Many receptor atlases are shared by the authors, *e.g.* the High-Resolution In Vivo Atlas of the Human Brain's Serotonin System from Beliveau et al. [<a href="#ref6">6</a>]

Important considerations:

- Templates should be in the same resolution and standard space as each other and the fMRI data
- Any reference regions used in the kinetic modeling of the PET data (e.g., cerebellum) should be masked out from the templates
- Multiple templates for the same receptor can be averaged if available

Once you've downloaded/obtained your PET maps and organised them somewhere:

```
my_react_project/
├── PET_templates/
│   ├── NAT.nii.gz
│   ├── DAT.nii.gz
│   └── SERT.nii.gz
```

Create a single 4D atlas by merging your normalized PET templates together (carefully note the order):

```bash
fslmerge -t PET_templates/PET_atlas_4D_NAT_DAT_SERT.nii.gz \
    PET_templates/NAT.nii.gz \
    PET_templates/DAT.nii.gz \
    PET_templates/SERT.nii.gz
```

Then normalize them to a 0-1 range:

```bash
react_normalize PET_templates/PET_atlas_4D_NAT_DAT_SERT.nii.gz \
    PET_templates/normalised_PET_atlas_4D_NAT_DAT_SERT.nii.gz
```

This normalization shifts the minimum value to zero and rescales by the span between minimum and maximum values, preserving the spatial distribution while standardizing the range across different PET maps.

### Step 4: Create Analysis Masks

Generate the masks required for the two-stage analysis:

```bash
react_masks \
    subject_list.txt \
    PET_templates/normalised_PET_atlas_4D_NAT_DAT_SERT.nii.gz \
    masks/grey_matter_mask.nii.gz \
    REACT_masks/
```

This creates:

- `mask_stage1.nii.gz`: Restricts Stage 1 spatial regression to grey matter voxels that have values from each PET map
- `mask_stage2.nii.gz`: Restricts Stage 2 temporal regression to grey matter voxels that have fMRI data for all participants

### Step 5: Run REACT for Each Subject

For a single subject:

```bash
react \
    fMRI_data/sub-001_preprocessed.nii.gz \
    REACT_masks/mask_stage1.nii.gz \
    REACT_masks/mask_stage2.nii.gz \
    PET_templates/normalised_PET_atlas_4D_NAT_DAT_SERT.nii.gz \
    REACT_output/sub-001/sub-001
```

For multiple subjects, use a bash loop:

```bash
for fmri_file in `cat subject_list.txt`
do
    # Extract subject ID (adjust based on your naming convention)
    subject_id=$(basename ${fmri_file} .nii.gz | sed 's/_preprocessed//')
    
    echo "Running REACT for ${subject_id}"
    mkdir -p REACT_output/${subject_id}
    
    react \
        ${fmri_file} \
        REACT_masks/mask_stage1.nii.gz \
        REACT_masks/mask_stage2.nii.gz \
        PET_templates/normalised_PET_atlas_4D_NAT_DAT_SERT.nii.gz \
        REACT_output/${subject_id}/${subject_id}
done
```

Expected outputs (per subject):

```
sub-001_react_stage1.txt              # molecular time series (one column per PET map in order of input)
sub-001_react_stage2.nii.gz           # 4D file with all maps
sub-001_react_stage2_map1.nii.gz      # NAT
sub-001_react_stage2_map2.nii.gz      # DAT
sub-001_react_stage2_map3.nii.gz      # SERT
```

### Step 6: Higher-Level Statistics

Once you have subject-level maps, perform group-level statistics using standard tools (e.g. FSL Randomise with threshold-free cluster enhancement (TFCE)):

```bash
# Example: stack all subjects' DAT maps into one 4D file
# Note: map2 corresponds to DAT (second PET map in the atlas)
fslmerge -t DAT_allsubs_4D.nii.gz \
    REACT_output/sub-001/sub-001_react_stage2_map2.nii.gz \
    REACT_output/sub-002/sub-002_react_stage2_map2.nii.gz \
    REACT_output/sub-003/sub-003_react_stage2_map2.nii.gz \
    ...
```

```bash
# Example: Run a higher level analysis using the DAT-networks (specifying a design matrix and contrasts according to your study design)
randomise -i DAT_allsubs_4D.nii.gz \
    -o group_DAT \
    -d design.mat -t design.con \
    -n 5000 -T
```

This allows you to:

- Compare groups (patients vs. controls)
- Test condition effects (drug vs. placebo)
- Correlate with behavioral/clinical measures

## Beyond Resting State: Extensions of REACT

While most REACT applications have used resting-state fMRI, the method can be extended to task-based and naturalistic paradigms. Task modifications (similar to gPPI approaches [<a href="#ref7">7</a>]) allow examination of how different neurotransmitter systems are engaged during specific cognitive processes or behavioral states. REACT can also be directly applied to naturalistic viewing or listening paradigms [<a href="#ref8">8</a>], bridging the gap between pure resting-state and structured-task designs without requiring explicit task responses.

## Interpreting Your Results

A few key points to remember:

**What REACT maps show:** How each brain region's BOLD signal correlates with the temporal dynamics of regions highly enriched in a particular receptor. Positive values indicate functional coupling; negative values indicate anti-correlation.

**What REACT does NOT show:** Direct measures of neurotransmitters. fMRI lacks the molecular specificity to measure these directly

**Statistical considerations:** The same principles apply as with standard fMRI: correct for multiple comparisons (ideally, Bonferroni correcting across molecular systems), consider sample size, and validate findings in independent cohorts when possible.

## Common Pitfalls and Tips

**Template quality matters:** Use high-quality, well-validated PET templates from adequate sample sizes. Poor templates yield poor results.

**Multiple systems:** When including multiple molecular templates simultaneously (strongly recommended), they're all estimated together in Stage 1, accounting for spatial overlap between systems. This can run into challenges of collinearity. Variance inflation factors (VIF) can help assess this for your combination of PET maps, with values >5 often suggested to be problematic. In practice, strategically selecting PET maps with distinct spatial distributions helps minimize collinearity issues and will maximise your chance of success.

**Interpretation isn't causation:** This is worth reiterating. Finding changes in, say, a serotonin-enriched network doesn't *prove* serotonin is causally involved. It suggests this is a useful framework for understanding the effects, but additional evidence (pharmacological challenges, PET studies, etc.) strengthens causal claims.


## Final Thoughts

REACT represents a shift toward biologically-informed fMRI. As molecular brain atlases become increasingly available and comprehensive, methods like REACT that bridge across modalities and scales will become increasingly powerful.

The approach is not without limitations. It depends on the quality of available PET templates, makes assumptions about the relationship between receptor density and function, and cannot directly measure neurotransmission. However, it provides a practical, scalable way to incorporate molecular information into fMRI analyses, offering new insights that conventional fMRI cannot achieve alone.

Whether you're studying drug effects, characterizing clinical populations, or simply curious about how neurochemistry shapes large-scale brain networks, REACT offers a valuable addition to your analytical toolkit [<a href="#ref1">1</a>]. The barrier to entry is low: if you can run standard fMRI preprocessing and analyses, you can run REACT.

Now, go forth and enrich your connectivity analyses!

---

**Questions or interested in collaborating?** I'm always happy to discuss REACT applications, troubleshoot analyses, or explore potential collaborations. Feel free to reach out:

- **Email**: tlawn1@mgh.harvard.edu
- **BlueSky**: @timlawn.bsky.social

## References

1. <a id="ref1"></a> Lawn T., Howard M. A., Turkheimer F. E., Mišić B., Deco G., Martins D., Dipasquale O. *From neurotransmitters to networks: Transcending organisational hierarchies with molecular-informed functional imaging.* _Neuroscience & Biobehavioral Reviews_, 2023; **150**: 105193. [https://doi.org/10.1016/j.neubiorev.2023.105193](https://doi.org/10.1016/j.neubiorev.2023.105193)

2. <a id="ref2"></a> Dipasquale O., Selvaggi P., Veronese M., Gabay A. S., Turkheimer F. E., Mehta M. A. *Receptor-Enriched Analysis of Functional Connectivity by Targets (REACT): A novel, multimodal analytical approach informed by PET to study the pharmacodynamic response of the brain under MDMA.* _NeuroImage_, 2019; **195**: 252–260. [https://doi.org/10.1016/j.neuroimage.2019.04.007](https://doi.org/10.1016/j.neuroimage.2019.04.007)

3. <a id="ref3"></a> Beckmann C. F., Mackay C. E., Filippini N., Smith S. M. *Group comparison of resting-state FMRI data using multi-subject ICA and dual regression.* _NeuroImage_, 2009; **47(Suppl 1)**: S148. [https://doi.org/10.1016/S1053-8119(09)71511-3](https://doi.org/10.1016/S1053-8119(09)71511-3)

4. <a id="ref4"></a> Markello R. D., Hansen J. Y., Liu Z.-Q., Bazinet V., Shafiei G., Suárez L. E., et al. *neuromaps: Structural and functional interpretation of brain maps.* _Nature Methods_, 2022; **19**: 1472–1479. [https://doi.org/10.1038/s41592-022-01647-0](https://doi.org/10.1038/s41592-022-01647-0)

5. <a id="ref5"></a> Dukart J., Holiga S., Rullmann M., Lanzenberger R., Hawkins P. C. T., Mehta M. A., et al. *JuSpace: A tool for spatial correlation analyses of magnetic resonance imaging data with nuclear imaging-derived neurotransmitter maps.* _Human Brain Mapping_, 2020; **42(2)**: 555–566. [https://doi.org/10.1002/hbm.25244](https://doi.org/10.1002/hbm.25244)

6. <a id="ref6"></a> Beliveau V., Ganz M., Feng L., Ozenne B., Højgaard L., Fisher P. M., Svarer C., Greve D. N., Knudsen G. M. *A high-resolution in vivo atlas of the human brain's serotonin system.* _Journal of Neuroscience_, 2017; **37(1)**: 120–128. [https://doi.org/10.1523/JNEUROSCI.2830-16.2016](https://doi.org/10.1523/JNEUROSCI.2830-16.2016)

7. <a id="ref7"></a> Wong N. M. I., Dipasquale O., Turkheimer F. E., Findon J. L., Wichers R. H., Dimitrov M., et al. *Differences in social brain function in autism spectrum disorder are linked to the serotonin transporter: A randomised placebo-controlled single-dose crossover trial.* _Journal of Psychopharmacology_, 2022; **36(6)**: 723–731. [https://doi.org/10.1177/02698811221092509](https://doi.org/10.1177/02698811221092509)

8. <a id="ref8"></a> Lawn T., Martins D., O'Daly O., Williams S., Howard M., Dipasquale O. *The effects of propofol anaesthesia on molecular-enriched networks during resting-state and naturalistic listening.* _NeuroImage_, 2023; **271**: 120018. [https://doi.org/10.1016/j.neuroimage.2023.120018](https://doi.org/10.1016/j.neuroimage.2023.120018)
